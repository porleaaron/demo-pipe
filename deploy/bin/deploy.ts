#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { Aws } from '@aws-cdk/core';
import { NetworkStack } from "../lib/network-stack";
import { EcrStack } from "../lib/ecr-stack";
import { EcsStack } from "../lib/ecs-stack";
import { CiCdStack } from "../lib/cicd-stack";

const app = new cdk.App({
  context: {
    appName: 'Aaron'
  }
});
const appName = app.node.tryGetContext('appName');
const env = app.node.tryGetContext('env')
const networkStack = new NetworkStack(app, `${appName}-Network-${env}`, {
  env: {
    region: Aws.REGION, account: Aws.ACCOUNT_ID
  }
});

const ecrStack = new EcrStack(app, `${appName}-Ecr-${env}`);

const ecsStack = new EcsStack(app, `${appName}-Ecs-${env}`, {
    vpc: networkStack.vpc,
    appRepository: ecrStack.appRepo,
});

new CiCdStack(app, `${appName}-Cicd-${env}`, {
  repos: {
    app: ecrStack.appRepo,
  },
  services: {
    app: ecsStack.appService.service,
  }    
});

app.synth();