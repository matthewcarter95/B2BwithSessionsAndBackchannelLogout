import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  sessionsTable: dynamodb.Table;
}

export class ComputeStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { vpc, sessionsTable } = props;

    // Import ALB security group from networking stack
    const albSecurityGroup = ec2.SecurityGroup.fromLookupByName(
      this,
      'ALBSecurityGroup',
      'b2b-alb-sg',
      vpc
    );

    const ecsSecurityGroup = ec2.SecurityGroup.fromLookupByName(
      this,
      'ECSSecurityGroup',
      'b2b-ecs-sg',
      vpc
    );

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
      // Image will be updated after Docker build and push
      image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'fargate',
        logGroup,
      }),
      environment: {
        NODE_ENV: 'production',
        PORT: '3000',
        AWS_REGION: this.region,
        DYNAMODB_TABLE_NAME: sessionsTable.tableName,
        // Auth0 config will be loaded from Secrets Manager in production
        // For now, set placeholder values
        AUTH0_DOMAIN: 'REPLACE_ME',
        AUTH0_CLIENT_ID: 'REPLACE_ME',
        CORS_ORIGIN: 'REPLACE_ME',
      },
      // Secrets from Secrets Manager
      // secrets: {
      //   AUTH0_M2M_CLIENT_ID: ecs.Secret.fromSecretsManager(auth0Secret, 'client_id'),
      //   AUTH0_M2M_CLIENT_SECRET: ecs.Secret.fromSecretsManager(auth0Secret, 'client_secret'),
      // },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3000/health || exit 1'],
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
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: '200',
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // Add HTTP listener (redirect to HTTPS in production)
    this.alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    // Create Fargate Service
    this.service = new ecs.FargateService(this, 'Service', {
      serviceName: 'b2b-backend-service',
      cluster: this.cluster,
      taskDefinition,
      desiredCount: 2,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      assignPublicIp: false,
      circuitBreaker: {
        rollback: true,
      },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
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
      value: `http://${this.alb.loadBalancerDnsName}`,
      description: 'Application Load Balancer URL',
    });

    new cdk.CfnOutput(this, 'BackchannelLogoutUrl', {
      value: `http://${this.alb.loadBalancerDnsName}/logout/backchannel`,
      description: 'Backchannel Logout Endpoint URL (configure in Auth0)',
    });

    // Add tags
    cdk.Tags.of(this.cluster).add('Component', 'Compute');
    cdk.Tags.of(this.service).add('Component', 'Backend');
    cdk.Tags.of(this.alb).add('Component', 'LoadBalancer');
  }
}
