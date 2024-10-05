import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';

class KubernetesClient {
    private kubeClient: CoreV1Api;

    constructor() {
        const kube = new KubeConfig();
        kube.loadFromDefault(); // NOTE: 로컬 환경이면 ~/.kube/config를 사용하고 POD 환경이면 /var/run/secrets/kubernetes.io/serviceaccount/token을 사용한다.
        this.kubeClient = kube.makeApiClient(CoreV1Api);
    }

    async getSecret(namespace: string, name: string) {
        const {
            body = {
                data: null,
            },
        } = await this.kubeClient.readNamespacedSecret(name, namespace).catch((error) => {
            if (error.response?.body.code === 404) {
                return { body: { data: null } };
            }
            console.error(error.response?.body);
            throw new Error('Failed to get secret');
        });

        if (!body.data) {
            return null;
        }

        return Object.fromEntries(
            Object.entries(body.data).map(([key, value]) => [key, Buffer.from(value, 'base64').toString('utf-8')]),
        );
    }

    async createSecret(namespace: string, name: string, data: Record<string, string>) {
        const secret = await this.kubeClient
            .createNamespacedSecret(namespace, {
                metadata: {
                    name,
                },
                data: Object.fromEntries(
                    Object.entries(data).map(([key, value]) => [key, Buffer.from(value).toString('base64')]),
                ),
            })
            .catch((error) => {
                console.error(error.response?.body);
                throw new Error('Failed to create secret');
            });

        return secret.body;
    }
}

export default new KubernetesClient();
