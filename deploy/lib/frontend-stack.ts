import * as cdk from '@aws-cdk/core'
import * as s3 from '@aws-cdk/aws-s3'
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as IAM from '@aws-cdk/aws-iam';
import codebuild = require("@aws-cdk/aws-codebuild");
import codepipeline = require("@aws-cdk/aws-codepipeline");
import actions = require("@aws-cdk/aws-codepipeline-actions");
import { SecretManagerUtil } from "../utils/secrets-manager";
import { SsmParameterUtil } from "../utils/ssm-parameter";
import { LinuxBuildImage } from '@aws-cdk/aws-codebuild';

const secrets = require('../bin/secrets.json');
const parameters = require('../bin/parameters.json');

interface FrontendStackProps extends cdk.StackProps { }

export class FrontendStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props?: FrontendStackProps) {
    super(scope, id, props);

    const appName = scope.node.tryGetContext('appName');
    const env = this.node.tryGetContext('env');
    const isProd = env === 'prod';

    const bucketName = `${appName.toLowerCase()}-frontend-bucket-${env}`;

    // S3
    const bucket = new s3.Bucket(this, `frontendBucket`, {
      bucketName,
      publicReadAccess: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: 'index.html',
    });

    // Cloudfront
    const cloudfrontDist = new cloudfront.CloudFrontWebDistribution(this, `${appName.toLowerCase()}-frontend-cloudfront-${env}`, {
      viewerCertificate: {
        aliases: ['www.idekadevelopment.com'],
        props: {
          acmCertificateArn: SsmParameterUtil.value(this, parameters.app.certificate.arn),
          sslSupportMethod: cloudfront.SSLMethod.SNI
        }
      },
      originConfigs: [
        {
          customOriginSource: {
            domainName: bucket.bucketWebsiteDomainName,
            originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          },
          behaviors: [{ isDefaultBehavior: true }]
        },
      ],
      errorConfigurations: [
        {
          "errorCode": 403,
          "errorCachingMinTtl": 300,
          "responseCode": 200,
          "responsePagePath": "/index.html",
        },
        {
          "errorCode": 404,
          "errorCachingMinTtl": 300,
          "responseCode": 200,
          "responsePagePath": "/index.html",
        }
      ]
    });

    /// Pipeline
    const sourceOutput = new codepipeline.Artifact();

    // Source Action
    const sourceAction = new actions.GitHubSourceAction({
      actionName: "GitHub-Source",
      owner: SsmParameterUtil.value(this, parameters.git.owner),
      repo: SsmParameterUtil.value(this, parameters.git.frontend.repo),
      branch: SsmParameterUtil.value(this, parameters.git.frontend.branch),
      oauthToken: SecretManagerUtil.secureValue(this, secrets.git.oauthToken),
      output: sourceOutput
    });

    /**
     * Manual Approval Action - Only for Production
     */
    const deployActions = [];
    if (isProd) {
      deployActions.push(new actions.ManualApprovalAction({
        actionName: "Review",
        additionalInformation: "Agree to deploy",
        runOrder: 1
      }));
    }

    /** 
     * Build And Deploy Project
     */
    const project = new codebuild.PipelineProject(this, 'Build-Frontend', {
      projectName: `${appName}-Build-Frontend-${env}`,
      environment: {
        buildImage: LinuxBuildImage.STANDARD_4_0,
        environmentVariables: {
          S3_BUCKET: {
            value: bucket.bucketName,
          },
          CLOUDFRONT_DIST_ID: {
            value: cloudfrontDist.distributionId,
          },
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        'version': '0.2',
        'phases': {
          'install': {
            'runtime-versions': {
              'nodejs': 12,
            },              
          },
          'pre_build': {
            'commands': [
              'yarn install'
            ]
          },
          'build': {
            'commands': [
              'echo Build started on `date`',
              'yarn lint',
              'yarn build',
              'aws s3 sync out s3://${S3_BUCKET}',
              'aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_DIST_ID} --paths "/*"'
            ],
            'finally': [
              'echo Build completed on `date`'
            ]
          }
        },
        'cache': {
          'paths': [
            './node_modules/**/*'
          ]
        }
      }),
      timeout: cdk.Duration.minutes(20),
    });

    // iam policy to push your build to S3
    project.addToRolePolicy(
      new IAM.PolicyStatement({
        effect: IAM.Effect.ALLOW,
        resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
        actions: [
          's3:GetBucket*',
          's3:List*',
          's3:GetObject*',
          's3:DeleteObject',
          's3:PutObject',
        ],
      })
    );

    // iam policy to invalidate cloudfront distribution's cache
    project.addToRolePolicy(
      new IAM.PolicyStatement({
        effect: IAM.Effect.ALLOW,
        resources: ['*'],
        actions: [
          'cloudfront:CreateInvalidation',
          'cloudfront:GetDistribution*',
          'cloudfront:GetInvalidation',
          'cloudfront:ListInvalidations',
          'cloudfront:ListDistributions',
        ],
      })
    );
    
    const buildAndDeployAction = new actions.CodeBuildAction({
      actionName: "BuildAndDeploy",
      input: sourceOutput,
      project,
      runOrder: isProd ? 2: 1
    });

    deployActions.push(buildAndDeployAction)

    /**
     * Create Pipeline
     */
    new codepipeline.Pipeline(this, `Frontend-Pipeline`, {
      pipelineName: `${appName}-Pipeline-Frontend-${env}`,
      restartExecutionOnUpdate: true,
      stages: [
        {
          /**
           * AWS CodePipeline stage to clone sources from GitHub repository
           */
          stageName: "Source",
          actions: [sourceAction],
        },
        {
          /**
           * AWS CodePipeline stage to deployt CRA website and CDK resources
           */
          stageName: "Deploy",
          actions: deployActions
        }
      ]
    })
  }
}