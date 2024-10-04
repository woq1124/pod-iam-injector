import { fastify } from 'fastify';
import configs from './configs';
import provider from './libs/provider';
import { AdmissionReview } from './types';
import kubeClient from './libs/kube-client';

function nonMutatingResponse(uid: string) {
    return {
        apiVersion: 'admission.k8s.io/v1',
        kind: 'AdmissionReview',
        response: {
            uid,
            allowed: true,
        },
    };
}

async function main() {
    await provider.initialize();
    const server = fastify();

    const jwks = await provider.generateJwksUriPayload();
    const openIdConfiguration = await provider.generateWellKnownOpenIdConfigurationPayload();

    server.get('/.well-known/openid-configuration', async (req, res) => {
        res.send(openIdConfiguration);
    });

    server.get('/keys', async (req, res) => {
        res.send(jwks);
    });

    server.post('/mutate', async (req, res) => {
        const admissionReview = req.body as AdmissionReview;

        if (!admissionReview.request.object) {
            res.send(nonMutatingResponse(admissionReview.request.uid));
            return;
        }

        const pod = admissionReview.request.object;

        if (!pod.metadata) {
            res.send(nonMutatingResponse(admissionReview.request.uid));
            return;
        }

        const { name, namespace, annotations } = pod.metadata;

        if (!name || !namespace || !annotations || !annotations['iam.amazonaws.com/role']) {
            res.send(nonMutatingResponse(admissionReview.request.uid));
            return;
        }

        const iamRole: string = annotations['iam.amazonaws.com/role'];

        const token = await provider.sign({
            sub: `system:pod:${namespace}:${name}`,
            name,
            group: namespace,
        });

        await kubeClient.createSecret(namespace, name, { token });

        const patches = [
            {
                op: 'add',
                path: '/spec/volumes/-',
                value: {
                    name: 'iam-token',
                    secret: {
                        secretName: name,
                    },
                },
            },
            {
                op: 'add',
                path: '/spec/containers/0/volumeMounts/-',
                value: {
                    name: 'iam-token',
                    mountPath: '/var/run/secrets/iam',
                },
            },
            {
                op: 'add',
                path: '/spec/containers/0/env/-',
                value: {
                    name: 'AWS_WEB_IDENTITY_TOKEN_FILE',
                    value: '/var/run/secrets/iam/token',
                },
            },
            {
                op: 'add',
                path: '/spec/containers/0/env/-',
                value: {
                    name: 'AWS_ROLE_ARN',
                    value: iamRole,
                },
            },
        ];

        res.send({
            apiVersion: 'admission.k8s.io/v1',
            kind: 'AdmissionReview',
            response: {
                uid: admissionReview.request.uid,
                allowed: true,
                patchType: 'JSONPatch',
                patch: Buffer.from(JSON.stringify(patches)).toString('base64'),
            },
        });
    });

    server.listen({ port: configs.port, host: configs.host }, (address) => {
        console.log(`Server listening at ${address}`);
    });
}

main();
