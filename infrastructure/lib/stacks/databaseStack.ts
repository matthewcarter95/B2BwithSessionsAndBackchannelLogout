import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DatabaseStack extends cdk.Stack {
  public readonly sessionsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB table for sessions
    this.sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      tableName: 'b2b-sessions',
      partitionKey: {
        name: 'sid',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep table on stack deletion
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Global Secondary Index for querying by userId
    this.sessionsTable.addGlobalSecondaryIndex({
      indexName: 'userId-expiresAt-index',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'expiresAt',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Output table name and ARN
    new cdk.CfnOutput(this, 'SessionsTableName', {
      value: this.sessionsTable.tableName,
      description: 'DynamoDB Sessions Table Name',
      exportName: 'B2B-SessionsTableName',
    });

    new cdk.CfnOutput(this, 'SessionsTableArn', {
      value: this.sessionsTable.tableArn,
      description: 'DynamoDB Sessions Table ARN',
      exportName: 'B2B-SessionsTableArn',
    });

    // Add tags
    cdk.Tags.of(this.sessionsTable).add('Component', 'Database');
    cdk.Tags.of(this.sessionsTable).add('Purpose', 'SessionStore');
  }
}
