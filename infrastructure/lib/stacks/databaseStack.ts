import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DatabaseStack extends cdk.Stack {
  public readonly sessionsTable: dynamodb.ITable;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing DynamoDB table
    this.sessionsTable = dynamodb.Table.fromTableArn(
      this,
      'SessionsTable',
      'arn:aws:dynamodb:us-west-2:204352680806:table/Auth0Sessions'
    );

    // Output table ARN
    new cdk.CfnOutput(this, 'SessionsTableArn', {
      value: this.sessionsTable.tableArn,
      description: 'DynamoDB Sessions Table ARN (existing table)',
      exportName: 'B2B-SessionsTableArn',
    });
  }
}
