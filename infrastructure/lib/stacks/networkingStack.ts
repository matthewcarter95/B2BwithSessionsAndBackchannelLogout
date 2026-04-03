import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkingStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC with public and private subnets
    this.vpc = new ec2.Vpc(this, 'B2BVpc', {
      vpcName: 'b2b-vpc',
      maxAzs: 3,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      natGateways: 1, // Use 1 NAT Gateway to save costs (use 3 for production HA)
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // VPC Endpoints for AWS services (save NAT Gateway costs)
    this.vpc.addGatewayEndpoint('DynamoDBEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // Interface endpoint for Secrets Manager
    this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      privateDnsEnabled: true,
    });

    // Interface endpoint for CloudWatch Logs
    this.vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      privateDnsEnabled: true,
    });

    // Security Group for Application Load Balancer
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'b2b-alb-sg',
      description: 'Security group for Application Load Balancer',
      allowAllOutbound: true,
    });

    // Allow inbound HTTP and HTTPS from anywhere
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP traffic from internet'
    );

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic from internet'
    );

    // Security Group for ECS Tasks
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'ECSSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'b2b-ecs-sg',
      description: 'Security group for ECS tasks',
      allowAllOutbound: true,
    });

    // Allow inbound traffic from ALB on port 3000
    this.ecsSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow traffic from ALB'
    );

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: 'B2B-VpcId',
    });

    new cdk.CfnOutput(this, 'ALBSecurityGroupId', {
      value: this.albSecurityGroup.securityGroupId,
      description: 'ALB Security Group ID',
      exportName: 'B2B-ALBSecurityGroupId',
    });

    new cdk.CfnOutput(this, 'ECSSecurityGroupId', {
      value: this.ecsSecurityGroup.securityGroupId,
      description: 'ECS Security Group ID',
      exportName: 'B2B-ECSSecurityGroupId',
    });

    // Add tags
    cdk.Tags.of(this.vpc).add('Component', 'Networking');
    cdk.Tags.of(this.albSecurityGroup).add('Component', 'LoadBalancer');
    cdk.Tags.of(this.ecsSecurityGroup).add('Component', 'Compute');
  }
}
