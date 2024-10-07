import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';

function decodeValue(data: Record<string, string>) {
    return Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, Buffer.from(value, 'base64').toString('utf-8')]),
    );
}

function encodeValue(data: Record<string, string>) {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Buffer.from(value).toString('base64')]));
}

class KubernetesResponseError extends Error {
    constructor(
        message: string,
        public response: any,
    ) {
        super(message);
    }
}

class KubernetesClient {
    kubeClient: CoreV1Api;

    constructor() {
        const kube = new KubeConfig();
        kube.loadFromDefault(); // NOTE: 로컬 환경이면 ~/.kube/config를 사용하고 POD 환경이면 /var/run/secrets/kubernetes.io/serviceaccount/token을 사용한다.
        this.kubeClient = kube.makeApiClient(CoreV1Api);
    }

    async listSecret(params?: { labelSelector?: string }) {
        const {
            body: { items },
        } = await this.kubeClient
            .listSecretForAllNamespaces(undefined, undefined, undefined, params?.labelSelector)
            .catch((error) => {
                throw new KubernetesResponseError(error.message, error.response?.body);
            });

        return items.map((secret) => ({
            name: secret.metadata?.name,
            namespace: secret.metadata?.namespace,
            data: secret.data && decodeValue(secret.data),
        }));
    }

    async listNamespacedSecretes(
        namespace: string,
        params?: {
            labelSelector?: string;
        },
    ) {
        const {
            body: { items },
        } = await this.kubeClient
            .listNamespacedSecret(namespace, undefined, undefined, undefined, undefined, params?.labelSelector)
            .catch((error) => {
                throw new KubernetesResponseError(error.message, error.response?.body);
            });

        return items.map((secret) => ({
            name: secret.metadata?.name,
            namespace: secret.metadata?.namespace,
            data: secret.data && decodeValue(secret.data),
        }));
    }

    async getNamespacedSecret(namespace: string, name: string) {
        const { body } = await this.kubeClient.readNamespacedSecret(name, namespace).catch((error) => {
            throw new KubernetesResponseError(error.message, error.response?.body);
        });

        return {
            name: body.metadata?.name,
            namespace: body.metadata?.namespace,
            data: body.data && decodeValue(body.data),
        };
    }

    async upsertNamespacedSecret(
        namespace: string,
        name: string,
        data: Record<string, string>,
        params?: { labels?: Record<string, string> },
    ) {
        const secret = await this.getNamespacedSecret(namespace, name).catch(() => null);

        if (secret) {
            return this.patchNamespacedSecret(namespace, name, data);
        }

        return this.createNamespacedSecret(namespace, name, data, params);
    }

    async patchNamespacedSecret(namespace: string, name: string, data: Record<string, string>) {
        const { body } = await this.kubeClient
            .patchNamespacedSecret(name, namespace, { data: encodeValue(data) })
            .catch((error) => {
                throw new KubernetesResponseError(error.message, error.response?.body);
            });

        return {
            name: body.metadata?.name,
            namespace: body.metadata?.namespace,
            data: body.data && decodeValue(body.data),
        };
    }

    async createNamespacedSecret(
        namespace: string,
        name: string,
        data: Record<string, string>,
        params?: { labels?: Record<string, string> },
    ) {
        const { body } = await this.kubeClient
            .createNamespacedSecret(namespace, {
                metadata: {
                    name,
                    labels: params?.labels,
                },
                data: encodeValue(data),
            })
            .catch((error) => {
                throw new KubernetesResponseError(error.message, error.response?.body);
            });

        return {
            name: body.metadata?.name,
            namespace: body.metadata?.namespace,
            data: body.data && decodeValue(body.data),
        };
    }
}

export default new KubernetesClient();
