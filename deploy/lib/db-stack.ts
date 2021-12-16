import * as cdk from '@aws-cdk/core';
import * as rds from '@aws-cdk/aws-rds';
import * as ec2 from '@aws-cdk/aws-ec2';
import { SsmParameterUtil } from '../utils/ssm-parameter';

const parameters = require('../bin/parameters.json');

export interface DBStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}
export class DBStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: DBStackProps) {
    super(scope, id, props);

    const appName = this.node.tryGetContext('appName');
    const env = this.node.tryGetContext('env');

    // use the default vpc for this account
    const vpc = props.vpc;

    // create rds instance
    const postgres = new rds.DatabaseInstance(this, `${appName}-db-${env}`, {
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc: vpc,
      allocatedStorage: 20,
      deletionProtection: true,
      maxAllocatedStorage: 100,
      databaseName: SsmParameterUtil.value(this, parameters.app.database.name),
      vpcPlacement: { subnetType: ec2.SubnetType.PUBLIC },
      // masterUsername: secret.secretValueFromJson('dbMaster').toString(),
      // masterUserPassword: secret.secretValueFromJson('dbPassword'),
    });

    postgres.connections.allowFromAnyIpv4(ec2.Port.tcp(5432))
  }
}
