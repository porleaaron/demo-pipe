import cdk = require("@aws-cdk/core");
import ec2 = require("@aws-cdk/aws-ec2");
import ecr = require("@aws-cdk/aws-ecr");
import ecs = require("@aws-cdk/aws-ecs");
import elbV2 = require("@aws-cdk/aws-elasticloadbalancingv2");
import { ApplicationProtocol } from "@aws-cdk/aws-elasticloadbalancingv2";
import { SsmParameterUtil } from "../utils/ssm-parameter";

const parameters = require('../bin/parameters.json');

interface EcsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  appRepository: ecr.Repository;

}

export class EcsStack extends cdk.Stack {
  public readonly ecsCluster: ecs.Cluster;
  public readonly appService: AppService;
  public readonly loadBalancer: elbV2.ApplicationLoadBalancer;
  public readonly httpsListener: elbV2.ApplicationListener;
  public readonly httpListener: elbV2.ApplicationListener;

  private readonly port = 80;
  private readonly protocol = ApplicationProtocol.HTTP;

  constructor(scope: cdk.App, id: string, props: EcsStackProps) {
    super(scope, id);

    const appName = scope.node.tryGetContext('appName');
    const env = scope.node.tryGetContext('env')

    this.ecsCluster = new ecs.Cluster(this, `${appName}-cluster-${env}`, {
      vpc: props.vpc
    });
    this.appService = new AppService(this, "AppService", this.ecsCluster, props.appRepository);
    this.loadBalancer = this.createLoadBalancer();

    this.httpListener = this.setupRedirectListener();
    // this.httpsListener = this.setupHttpsListener();

    // this.httpsListener.addCertificateArns("TDSCertificate", [
    //   SsmParameterUtil.value(this, parameters.app.certificate.arn)
    // ]);

    this.outputValues();
  }

  createLoadBalancer(): elbV2.ApplicationLoadBalancer {
    return new elbV2.ApplicationLoadBalancer(this, 'ProxyLb', {
      vpc: this.ecsCluster.vpc,
      internetFacing: true,
    });
  }

  // setupHttpsListener(): elbV2.ApplicationListener {
  //   const listener = this.loadBalancer.addListener('HttpsListener', {
  //     protocol: this.protocol,
  //     port: this.port,
  //     open: true,
  //   });


  //   const appTargetGroup = listener.addTargets('AppTarget', {
  //     port: this.appService.port,
  //     healthCheck: {
  //       path: '/app/health'
  //     },
  //     pathPattern: '/app/*',
  //     protocol: ApplicationProtocol.HTTP,
  //     priority: 90
  //   });
  //   appTargetGroup.addTarget(this.appService.service);

  //   listener.addFixedResponse('default', {
  //     statusCode: '200',
  //     messageBody: 'This is the ALB Default Action'
  //   })

  //   return listener;
  // }

  setupRedirectListener(): elbV2.ApplicationListener {
    // const listener = this.loadBalancer.addListener('HttpListener', {
    //   protocol: ApplicationProtocol.HTTP,
    //   port: 80,
    //   open: true,
    // });

    // listener.addRedirectResponse("https-redirect", {
    //   statusCode: 'HTTP_301',
    //   protocol: ApplicationProtocol.HTTPS,
    //   port: '443',
    // });

    const listener = this.loadBalancer.addListener('HttpListener', {
      protocol: this.protocol,
      port: this.port,
      open: true,
    });


    const appTargetGroup = listener.addTargets('AppTarget', {
      port: this.appService.port,
      healthCheck: {
        path: '/'
      },
      pathPattern: '/*',
      protocol: ApplicationProtocol.HTTP,
      priority: 90
    });
    appTargetGroup.addTarget(this.appService.service);

    listener.addFixedResponse('default', {
      statusCode: '200',
      messageBody: 'This is the ALB Default Action'
    })

    return listener;
  }

  outputValues() {
    const dnsName = this.loadBalancer.loadBalancerDnsName;
    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: dnsName });
  }
}

class AppService extends cdk.Construct {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly repo: ecr.Repository;

  public readonly port = 80;

  constructor(scope: cdk.Construct, id: string, cluster: ecs.Cluster, repo: ecr.Repository) {
    super(scope, id);
    const env = scope.node.tryGetContext('env');
    const isProd = env === 'prod';

    this.cluster = cluster;
    this.repo = repo;
    this.service = this.createFargateService(isProd);
  }

  createFargateService(isProd: boolean): ecs.FargateService {
    const env = this.node.tryGetContext('env');
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'AppTaskDef', {
      cpu: 256,
      memoryLimitMiB: 512
    });
    const logDriver = new ecs.AwsLogDriver({ streamPrefix: this.node.id });

    const environment = {
      STAGE: env,
    }

    const secrets = {
   }

    const container = taskDefinition.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromEcrRepository(this.repo),
      logging: logDriver,
      environment,
      secrets,
      cpu: 256,
      memoryLimitMiB: 512
    });
    container.addPortMappings({ containerPort: this.port }); 

    const fargateService = new ecs.FargateService(this, 'AppService', {
      cluster: this.cluster,
      taskDefinition: taskDefinition,
      assignPublicIp: true,
    });
    fargateService.connections.allowFromAnyIpv4(ec2.Port.allTcp());
    fargateService.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 3 });
    return fargateService;
  }
}

