import cdk = require("@aws-cdk/core");
import ecr = require("@aws-cdk/aws-ecr");
import ecs = require("@aws-cdk/aws-ecs");
import codebuild = require("@aws-cdk/aws-codebuild");
import codepipeline = require("@aws-cdk/aws-codepipeline");
import actions = require("@aws-cdk/aws-codepipeline-actions");
import { SecretManagerUtil } from "../utils/secrets-manager";
import { SsmParameterUtil } from "../utils/ssm-parameter";
import { GitHubTrigger } from "@aws-cdk/aws-codepipeline-actions";

const secrets = require('../bin/secrets.json');
const parameters = require('../bin/parameters.json');

interface RepoSet {
  app: ecr.Repository,
}

interface ServiceSet {
  app: ecs.FargateService,
}

interface CiCdStackProps extends cdk.StackProps {
  repos: RepoSet,
  services: ServiceSet,
}

export class CiCdStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: CiCdStackProps) {
    super(scope, id);

    const appName = scope.node.tryGetContext('appName');
    const env = scope.node.tryGetContext('env');
    const isProd = env === 'prod';

    // Creates a CodeBuild project for our demo app to be used within the CodePipeline pipeline.
    // See docs for other default values - https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-codebuild.PipelineProject.html
    const codebuildProject = new codebuild.PipelineProject(this, `${appName}-Build-${env}`, {
      projectName: `${appName}-Build-Project-${env}`,
      environment: {
        computeType: codebuild.ComputeType.SMALL,
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2,
        privileged: true,
        environmentVariables: {
          AWS_ACCOUNT_ID: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: cdk.Aws.ACCOUNT_ID
          },
          AWS_DEFAULT_REGION: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: cdk.Aws.REGION
          },
          ENV: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: env
          }
        },
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('./buildspec.yml'),
      checkSecretsInPlainTextEnvVariables: false
    });
    // Grants required permissions on ECR to the CodeBuild project
    props.repos.app.grantPullPush(codebuildProject.grantPrincipal);

    const sourceOutput = new codepipeline.Artifact();
    // Source Action
    const sourceAction = new actions.GitHubSourceAction({
      actionName: "GitHub-Source",
      owner: SsmParameterUtil.value(this, parameters.git.owner),
      repo: SsmParameterUtil.value(this, parameters.git.repo),
      branch: SsmParameterUtil.value(this, parameters.git.branch),
      oauthToken: SecretManagerUtil.secureValue(this, secrets.git.oauthToken),
      output: sourceOutput,
      trigger: GitHubTrigger.POLL
    });
    const buildOutput = new codepipeline.Artifact();
    // Build Action, uses the CodeBuild project above
    const buildAction = new actions.CodeBuildAction({
      actionName: "Build",
      input: sourceOutput,
      outputs: [
        buildOutput
      ],
      project: codebuildProject,
    });

    // Approve Action
    const manualApprovalAction = new actions.ManualApprovalAction({
      actionName: 'Approve',
    });
    
    // Deploy Action

    const appDeployAction = new actions.EcsDeployAction({
      actionName: "AppDeployAction",
      service: props.services.app,
      imageFile: buildOutput.atPath('appdefinitions.json')
    });

    // Build the pipeline with the actions defined above
    const pipeline = new codepipeline.Pipeline(this, `${appName}-Pipeline-${env}`, {
      pipelineName: `${appName}-pipeline-${env}`
    });
    pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction]
    });
    pipeline.addStage({
      stageName: "Build",
      actions: [buildAction]
    });

    // Add Approve Stage for Production
    if (isProd) {
      pipeline.addStage({
        stageName: 'Approve',
        actions: [manualApprovalAction],
      })
    }
    
    pipeline.addStage({
      stageName: "Deploy-Cms-App",
      actions: [appDeployAction]
    });
  }
}
