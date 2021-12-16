import cdk = require("@aws-cdk/core");
import ecr = require("@aws-cdk/aws-ecr");

export class EcrStack extends cdk.Stack {
  public readonly appRepo: ecr.Repository;

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    const env = scope.node.tryGetContext('env');
    const appName = scope.node.tryGetContext('appName');
    const prefix = appName.toLowerCase();

    // Creates an ECR repository.
    // See docs for other default values - https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ecr.Repository.html

    this.appRepo = new ecr.Repository(this, "AppRepository", {
      repositoryName: `${prefix}/${env}/app`
    });
  }
}