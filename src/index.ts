import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import { generateKeyPair, exportSPKI, exportPKCS8, importSPKI, exportJWK } from 'jose';

class KubernetesClient {
    private kubeClient: CoreV1Api;

    constructor() {
        const kube = new KubeConfig();
        kube.loadFromDefault(); // NOTE: 로컬 환경이면 ~/.kube/config를 사용하고 POD 환경이면 /var/run/secrets/kubernetes.io/serviceaccount/token을 사용한다.
        this.kubeClient = kube.makeApiClient(CoreV1Api);
    }

    async getSecret(namespace: string, name: string) {
        const secret = await this.kubeClient.readNamespacedSecret(name, namespace);
        return secret.body.data;
    }

    async createSecret(namespace: string, name: string, data: Record<string, string>) {
        const secret = await this.kubeClient.createNamespacedSecret(namespace, {
            metadata: {
                name,
            },
            data,
        });
        return secret.body;
    }
}

async function initialize() {
    const client = new KubernetesClient();
    let secret = await client.getSecret('cicd', 'docker-config').catch((error) => {
        if (error.response?.body?.code === 404) {
            console.log('Secret not found in the namespace\nIt will be created');
            return null;
        } else {
            throw error;
        }
    });

    if (secret === null) {
        const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
        const publicSPKI = await exportSPKI(publicKey);
        const privatePKCS8 = await exportPKCS8(privateKey);
        const jwk = await importSPKI(publicSPKI, 'RS256');
        const jwkExport = await exportJWK(jwk);
        jwkExport.kid = 'test';
        jwkExport.use = 'sig';
        jwkExport.alg = 'RS256';
        console.log(jwkExport);

        // const data = {
        //     publicKey: await exportSPKI(publicKey),
        //     privateKey: await exportPKCS8(privateKey),
        // };
    }
    console.log(secret);
}

async function main() {
    await initialize();
}

main();
