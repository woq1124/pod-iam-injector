import fs from 'fs';
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

const tlsKey = fs.readFileSync(`${configs.certificatePath}/tls.key`, 'utf8');
const tlsCert = fs.readFileSync(`${configs.certificatePath}/tls.crt`, 'utf8');

async function main() {
    await provider.initialize();

    const jwks = await provider.generateJwksUriPayload();
    const openIdConfiguration = await provider.generateWellKnownOpenIdConfigurationPayload();
    const oidcProviderServer = fastify({ logger: true });
    oidcProviderServer.get('/healthz', async (req, res) => {
        res.send('ok');
    });
    oidcProviderServer.get('/.well-known/openid-configuration', async (req, res) => {
        res.send(openIdConfiguration);
    });
    oidcProviderServer.get('/keys', async (req, res) => {
        res.send(jwks);
    });
    oidcProviderServer.listen({ port: 8080, host: '0.0.0.0' }, (err) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
    });

    const mutateWebhookServer = fastify({ logger: true, https: { key: tlsKey, cert: tlsCert } });
    mutateWebhookServer.post('/mutate', async (req, res) => {
        console.dir(req.body, { depth: 5 });
        const admissionReview = req.body as AdmissionReview;

        if (!admissionReview.request.object) {
            res.send(nonMutatingResponse(admissionReview.request.uid));
            return;
        }

        const pod = admissionReview.request.object;

        console.dir(pod, { depth: 5 });

        if (!pod.metadata) {
            res.send(nonMutatingResponse(admissionReview.request.uid));
            return;
        }

        const { name, generateName, namespace, annotations } = pod.metadata;

        console.dir({ name, generateName, namespace, annotations }, { depth: 5 });

        const podName = name ?? generateName?.split('-').slice(0, -2).join('-');

        if (!podName || !annotations || !annotations['iam.amazonaws.com/role']) {
            res.send(nonMutatingResponse(admissionReview.request.uid));
            return;
        }

        const iamRole: string = annotations['iam.amazonaws.com/role'];

        const token = await provider.sign({
            sub: `system:pod:${namespace}:${name}`,
            name,
            group: namespace,
        });

        console.dir({ iamRole, token }, { depth: 5 });

        try {
            await kubeClient.createSecret(namespace, podName, { token });
        } catch (error: any) {
            if (error.response?.body.code !== 409) {
                console.log('Secret already exists');
            } else {
                console.error(error.response?.body);
                throw new Error('Failed to create secret');
            }
        }

        const patches: any[] = [];

        patches.push([
            {
                op: 'add',
                path: '/spec/volumes/-',
                value: {
                    name: 'iam-token',
                    secret: {
                        secretName: podName,
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
        ]);

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
    mutateWebhookServer.listen({ port: 8443, host: '0.0.0.0' }, (err) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
    });
}

main();
