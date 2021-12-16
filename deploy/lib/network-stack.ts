import cdk = require("@aws-cdk/core");
import ec2 = require("@aws-cdk/aws-ec2");

export interface NetworkStackProps extends cdk.StackProps {
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;

  constructor(scope: cdk.Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    // Creates a VPC across 3 AZs with a NAT Gateway each.
    // See docs for other default values - https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ec2.Vpc.html
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 3,
      cidr: '10.10.0.0/16',
      subnetConfiguration: [
        {
          name: 'public',
          cidrMask: 24,
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'private',
          cidrMask: 24,
          subnetType: ec2.SubnetType.PRIVATE,
        },
      ]
    })
  }
}
