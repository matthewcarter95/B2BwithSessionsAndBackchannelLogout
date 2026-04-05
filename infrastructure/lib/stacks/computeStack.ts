import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  sessionsTable: dynamodb.ITable;
  albSecurityGroup: ec2.SecurityGroup;
  ecsSecurityGroup: ec2.SecurityGroup;
}

export class ComputeStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { vpc, sessionsTable, albSecurityGroup, ecsSecurityGroup } = props;

    // Create ECS Cluster
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: 'b2b-backend-cluster',
      vpc,
      containerInsights: true,
    });

    // Create CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'BackendLogGroup', {
      logGroupName: '/ecs/b2b-backend',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Task Execution Role (for pulling images and writing logs)
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Task Role (for application permissions)
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Grant DynamoDB permissions to task role
    sessionsTable.grantReadWriteData(taskRole);

    // Grant explicit permissions for GSI queries (needed when importing table)
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:Query'],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/Auth0Sessions/index/*`,
        ],
      })
    );

    // Grant Secrets Manager permissions (for Auth0 credentials)
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:auth0/*`,
        ],
      })
    );

    // Create Fargate Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: 'b2b-backend',
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole,
      taskRole,
    });

    // Add container
    const container = taskDefinition.addContainer('backend', {
      containerName: 'express-server',
      // Use backend image from ECR
      image: ecs.ContainerImage.fromRegistry('204352680806.dkr.ecr.us-west-2.amazonaws.com/b2b-backend:latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'fargate',
        logGroup,
      }),
      environment: {
        NODE_ENV: 'production',
        PORT: '3000',
        AWS_REGION: this.region,
        DYNAMODB_TABLE_NAME: 'Auth0Sessions',
        // Auth0 configuration
        AUTH0_DOMAIN: 'fiscal-psft.cic-demo-platform.auth0app.com',
        AUTH0_CLIENT_ID: '1RjG2svPN9c6O2bGHDEGxvc2WxCd6ewI',
        AUTH0_M2M_CLIENT_ID: 'yXEDcSCqsHUVxEfETz8V6eSNFVuwa8jr',
        AUTH0_M2M_CLIENT_SECRET: 'sqqk_tBNLOCDNCb1Y4EXxX7k8V-LPeHGwq1ZYaZ2Ij1SaZ2UlBv4MY08GzLGoHSY',
        AUTH0_AUDIENCE: 'https://fiscal-psft.cic-demo-platform.auth0app.com/api/v2/',
        CORS_ORIGIN: 'https://adp-spa.demo-connect.us',
      },
      // Secrets from Secrets Manager
      // secrets: {
      //   AUTH0_M2M_CLIENT_ID: ecs.Secret.fromSecretsManager(auth0Secret, 'client_id'),
      //   AUTH0_M2M_CLIENT_SECRET: ecs.Secret.fromSecretsManager(auth0Secret, 'client_secret'),
      // },
      healthCheck: {
        command: ['CMD-SHELL', "node -e \"require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})\""],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // Add port mapping
    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    // Create Application Load Balancer
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      loadBalancerName: 'b2b-alb',
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    // Create Target Group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      targetGroupName: 'b2b-backend-tg',
      vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(15),  // Faster health checks
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,  // 2 × 15s = 30s to become healthy
        unhealthyThresholdCount: 2,  // Fail faster
        healthyHttpCodes: '200',
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // Import ACM certificate
    const certificate = certificatemanager.Certificate.fromCertificateArn(
      this,
      'Certificate',
      'arn:aws:acm:us-west-2:204352680806:certificate/8c19113f-425f-4185-a2e9-fb2dcc5f86c4'
    );

    // Add HTTPS listener
    this.alb.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    // Add HTTP listener that redirects to HTTPS
    this.alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    });

    // Create Fargate Service
    this.service = new ecs.FargateService(this, 'Service', {
      serviceName: 'b2b-backend-service',
      cluster: this.cluster,
      taskDefinition,
      desiredCount: 1,  // Start with 1 task for faster deployment
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      assignPublicIp: false,
      circuitBreaker: {
        rollback: true,
      },
      healthCheckGracePeriod: cdk.Duration.seconds(180),  // 3 minutes grace period
    });

    // Attach service to target group
    this.service.attachToApplicationTargetGroup(targetGroup);

    // Auto Scaling
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 4,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // Outputs
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'ECS Cluster Name',
      exportName: 'B2B-ClusterName',
    });

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      description: 'ECS Service Name',
      exportName: 'B2B-ServiceName',
    });

    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: this.alb.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name',
      exportName: 'B2B-LoadBalancerDNS',
    });

    new cdk.CfnOutput(this, 'LoadBalancerUrl', {
      value: `https://adp-backend.demo-connect.us`,
      description: 'Backend API URL (HTTPS)',
    });

    new cdk.CfnOutput(this, 'LoadBalancerDNSforCNAME', {
      value: this.alb.loadBalancerDnsName,
      description: 'Point adp-backend.demo-connect.us CNAME to this DNS name',
    });

    new cdk.CfnOutput(this, 'BackchannelLogoutUrl', {
      value: `https://adp-backend.demo-connect.us/logout/backchannel`,
      description: 'Backchannel Logout Endpoint URL (configure in Auth0)',
    });

    // Add tags
    cdk.Tags.of(this.cluster).add('Component', 'Compute');
    cdk.Tags.of(this.service).add('Component', 'Backend');
    cdk.Tags.of(this.alb).add('Component', 'LoadBalancer');
  }
}
