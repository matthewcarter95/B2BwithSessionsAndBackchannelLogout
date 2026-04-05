#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkingStack } from '../lib/stacks/networkingStack';
import { DatabaseStack } from '../lib/stacks/databaseStack';
import { ComputeStack } from '../lib/stacks/computeStack';
import { LambdaStack } from '../lib/stacks/lambdaStack';

const app = new cdk.App();

// Get environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
};

const projectName = 'B2B';

// Stack 1: Networking (VPC, Subnets, Security Groups)
const networkingStack = new NetworkingStack(app, `${projectName}NetworkingStack`, {
  env,
  description: 'VPC, Subnets, and Security Groups for B2B Application',
});

// Stack 2: Database (DynamoDB)
const databaseStack = new DatabaseStack(app, `${projectName}DatabaseStack`, {
  env,
  description: 'DynamoDB tables for B2B Application',
});

// Stack 3: Lambda (Session API) - SKIPPED, using existing Lambda
// const lambdaStack = new LambdaStack(app, `${projectName}LambdaStack`, {
//   env,
//   description: 'Lambda functions for B2B Application',
//   vpc: networkingStack.vpc,
//   sessionsTable: databaseStack.sessionsTable,
// });

// Stack 4: Compute (ECS, ALB)
const computeStack = new ComputeStack(app, `${projectName}ComputeStack`, {
  env,
  description: 'ECS Cluster, Service, and Load Balancer for B2B Application',
  vpc: networkingStack.vpc,
  sessionsTable: databaseStack.sessionsTable,
  albSecurityGroup: networkingStack.albSecurityGroup,
  ecsSecurityGroup: networkingStack.ecsSecurityGroup,
});

// Add dependencies
// lambdaStack.addDependency(networkingStack);
// lambdaStack.addDependency(databaseStack);
computeStack.addDependency(networkingStack);
computeStack.addDependency(databaseStack);

// Add tags to all stacks
cdk.Tags.of(app).add('Project', 'B2B-App');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('Environment', app.node.tryGetContext('environment') || 'dev');
