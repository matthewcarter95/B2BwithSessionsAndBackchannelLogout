import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

interface LambdaStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  sessionsTable: dynamodb.ITable;
}

export class LambdaStack extends cdk.Stack {
  public readonly sessionApiFunction: lambda.Function;
  public readonly sessionApiFunctionUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { vpc, sessionsTable } = props;

    // Lambda function for Session API
    this.sessionApiFunction = new lambda.Function(this, 'SessionApiFunction', {
      functionName: 'b2b-session-api',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'sessionApi.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda'), {
        bundling: {
          image: lambda.Runtime.NODEJS_18_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'cp -r . /asset-output/ && cd /asset-output && npm install --production',
          ],
        },
      }),
      environment: {
        TABLE_NAME: sessionsTable.tableName,
        NODE_ENV: 'production',
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Grant read permissions on DynamoDB table
    sessionsTable.grantReadData(this.sessionApiFunction);

    // Create Function URL
    this.sessionApiFunctionUrl = this.sessionApiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE, // Use AWS_IAM for production
      cors: {
        allowedOrigins: ['*'], // Configure with actual frontend domains in production
        allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.OPTIONS],
        allowedHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'SessionApiFunctionName', {
      value: this.sessionApiFunction.functionName,
      description: 'Session API Lambda Function Name',
      exportName: 'B2B-SessionApiFunctionName',
    });

    new cdk.CfnOutput(this, 'SessionApiFunctionUrl', {
      value: this.sessionApiFunctionUrl.url,
      description: 'Session API Lambda Function URL',
      exportName: 'B2B-SessionApiFunctionUrl',
    });

    // Add tags
    cdk.Tags.of(this.sessionApiFunction).add('Component', 'API');
    cdk.Tags.of(this.sessionApiFunction).add('Purpose', 'SessionAPI');
  }
}
