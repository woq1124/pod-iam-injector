import { KubeConfig, CoreV1Api, BatchV1Api, V1CronJob } from '@kubernetes/client-node';

function decodeValue(data: Record<string, string>) {
    return Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, Buffer.from(value, 'base64').toString('utf-8')]),
    );
}

function encodeValue(data: Record<string, string>) {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Buffer.from(value).toString('base64')]));
}

export class KubernetesResponseError extends Error {
    constructor(
        public data: {
            kind: string;
            apiVersion: string;
            metadata: Record<string, string>;
            status: string;
            message: string;
            reason: string;
            details: { name: string; group: string; kind: string };
            code: number;
        },
    ) {
        super(data.message);
    }
}

class KubernetesClient {
    private coreApiClient: CoreV1Api;

    private batchApiClient: BatchV1Api;

    constructor() {
        const kube = new KubeConfig();
        kube.loadFromDefault(); // NOTE: 로컬 환경이면 ~/.kube/config를 사용하고 POD 환경이면 /var/run/secrets/kubernetes.io/serviceaccount/token을 사용한다.
        this.coreApiClient = kube.makeApiClient(CoreV1Api);
        this.batchApiClient = kube.makeApiClient(BatchV1Api);
    }

    async listSecret(params?: { labelSelector?: string }) {
        const {
            body: { items },
        } = await this.coreApiClient
            .listSecretForAllNamespaces(undefined, undefined, undefined, params?.labelSelector)
            .catch((error) => {
                throw new KubernetesResponseError(error.response?.body);
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
        } = await this.coreApiClient
            .listNamespacedSecret(namespace, undefined, undefined, undefined, undefined, params?.labelSelector)
            .catch((error) => {
                throw new KubernetesResponseError(error.response?.body);
            });

        return items.map((secret) => ({
            name: secret.metadata?.name,
            namespace: secret.metadata?.namespace,
            data: secret.data && decodeValue(secret.data),
        }));
    }

    async getNamespacedSecret(namespace: string, name: string) {
        const { body } = await this.coreApiClient.readNamespacedSecret(name, namespace).catch((error) => {
            throw new KubernetesResponseError(error.response?.body);
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
        const { body } = await this.coreApiClient
            .patchNamespacedSecret(name, namespace, { data: encodeValue(data) })
            .catch((error) => {
                throw new KubernetesResponseError(error.response?.body);
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
        const { body } = await this.coreApiClient
            .createNamespacedSecret(namespace, {
                metadata: {
                    name,
                    labels: params?.labels,
                },
                data: encodeValue(data),
            })
            .catch((error) => {
                throw new KubernetesResponseError(error.response?.body);
            });

        return {
            name: body.metadata?.name,
            namespace: body.metadata?.namespace,
            data: body.data && decodeValue(body.data),
        };
    }

    async getNamespacedCronJob(namespace: string, name: string) {
        const { body } = await this.batchApiClient.readNamespacedCronJob(name, namespace).catch((error) => {
            throw new KubernetesResponseError(error.response?.body);
        });

        return body;
    }

    async createNamespacedCronJob(namespace: string, spec: V1CronJob) {
        await this.batchApiClient.createNamespacedCronJob(namespace, spec);
    }
}

export default new KubernetesClient();
