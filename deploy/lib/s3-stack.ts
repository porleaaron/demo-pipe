import cdk = require("@aws-cdk/core");
import s3 = require("@aws-cdk/aws-s3");
interface S3StackProps extends cdk.StackProps {
}

export class S3Stack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: S3StackProps) {
    super(scope, id, props);

    const appName = this.node.tryGetContext('appName');
    const env = this.node.tryGetContext('env');

    const bucketName = `${appName.toLowerCase()}-bucket-${env}`


    new s3.Bucket(this, `mediaBucket-${env}`, {
      bucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
