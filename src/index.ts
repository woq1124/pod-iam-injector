import fs from 'fs';
import { CLIENT_RENEG_LIMIT } from 'tls';
import { fastify } from 'fastify';
import { AdmissionReview } from './types';
import { CERTIFICATE_PATH, JSON_WEB_KEY_COUNT } from './configs';
import kubeClient from './libs/kube-client';
import logger from './libs/logger';
import JsonWebKeyProvider from './libs/provider';

// function nonMutatingResponse(uid: string) {
//     return {
//         apiVersion: 'admission.k8s.io/v1',
//         kind: 'AdmissionReview',
//         response: {
//             uid,
//             allowed: true,
//         },
//     };
// }

// const tlsKey = fs.readFileSync(`${CERTIFICATE_PATH}/tls.key`, 'utf8');
// const tlsCert = fs.readFileSync(`${CERTIFICATE_PATH}/tls.crt`, 'utf8');

// TODO: 코드가 너무 더럽다. 리팩토링이 필요하다.
// TODO: logger를 사용하자.
// TODO: mutate webhook config를 앱에서 생성하는 것이 괜찮을듯...
async function main() {
    const secrets = await kubeClient.listSecretes('pod-iam-injector', {
        labelSelector: 'app.kubernetes.io/component=json-web-key',
    });

    if (secrets.length !== JSON_WEB_KEY_COUNT) {
        const newKeyPairs = await JsonWebKeyProvider.generateKeyPairs(JSON_WEB_KEY_COUNT - secrets.length);
        const newSecrets = await Promise.all(
            newKeyPairs.map((keyPair, index) =>
                kubeClient.createSecret('pod-iam-injector', `json-web-key-${secrets.length + index}`, keyPair, {
                    labels: { 'app.kubernetes.io/component': 'json-web-key' },
                }),
            ),
        );
        secrets.push(...newSecrets);
    }

    if (!secrets.every((secret) => secret.data?.kid && secret.data?.publicKey && secret.data?.privateKey)) {
        throw new Error('Failed to get json-web-key');
    }

    const jsonWebKeyProvider = new JsonWebKeyProvider(
        secrets.map((secret) => ({
            kid: secret.data!.kid,
            publicKey: secret.data!.publicKey,
            privateKey: secret.data!.privateKey,
        })),
    );

    const oidcProviderServer = fastify({ logger: true });
    oidcProviderServer.get('/healthz', async (req, res) => {
        res.send('ok');
    });
    oidcProviderServer.get('/.well-known/openid-configuration', async (req, res) => {
        res.send(await jsonWebKeyProvider.generateWellKnownOpenIdConfiguration());
    });
    oidcProviderServer.get('/keys', async (req, res) => {
        res.send(await jsonWebKeyProvider.generateJwks());
    });

    // const mutateWebhookServer = fastify({ logger: true, https: { key: tlsKey, cert: tlsCert } });

    // await provider.initialize();

    // const mutateWebhookServer = fastify({ logger: true, https: { key: tlsKey, cert: tlsCert } });
    // mutateWebhookServer.post('/mutate', async (req, res) => {
    //     console.dir(req.body, { depth: 5 });
    //     const admissionReview = req.body as AdmissionReview;

    //     if (!admissionReview.request.object) {
    //         res.send(nonMutatingResponse(admissionReview.request.uid));
    //         return;
    //     }

    //     const pod = admissionReview.request.object;

    //     if (!pod.metadata) {
    //         res.send(nonMutatingResponse(admissionReview.request.uid));
    //         return;
    //     }

    //     const { name, generateName, namespace, annotations } = pod.metadata;

    //     const podName = name ?? generateName?.split('-').slice(0, -2).join('-'); // TODO: deployment로 생성되는 podName에 대한 것만 있음.

    //     if (!podName || !annotations || !annotations['iam.amazonaws.com/role']) {
    //         res.send(nonMutatingResponse(admissionReview.request.uid));
    //         return;
    //     }

    //     const iamRole: string = annotations['iam.amazonaws.com/role'];

    //     const token = await provider.sign({
    //         sub: `system:pod:${namespace}:${name}`,
    //         name,
    //         group: namespace,
    //         exp: '24h',
    //     });

    //     try {
    //         await kubeClient.createSecret(namespace, podName, { token });
    //     } catch (error: any) {
    //         if (error.response?.body.code !== 409) {
    //             console.log('Secret already exists');
    //         } else {
    //             console.error(error.response?.body);
    //             throw new Error('Failed to create secret');
    //         }
    //     }

    //     // TODO: 타입 정리 필요
    //     const patches: any[] = [];

    //     if (!pod.spec.containers[0].env) {
    //         patches.push({
    //             op: 'add',
    //             path: '/spec/containers/0/env',
    //             value: [] as any,
    //         });
    //     }

    //     patches.push(
    //         ...[
    //             {
    //                 op: 'add',
    //                 path: '/spec/volumes/-',
    //                 value: {
    //                     name: 'iam-token',
    //                     secret: {
    //                         secretName: podName,
    //                     },
    //                 },
    //             },
    //             {
    //                 op: 'add',
    //                 path: '/spec/containers/0/volumeMounts/-',
    //                 value: {
    //                     name: 'iam-token',
    //                     mountPath: '/var/run/secrets/iam',
    //                 },
    //             },
    //             {
    //                 op: 'add',
    //                 path: '/spec/containers/0/env/-',
    //                 value: {
    //                     name: 'AWS_WEB_IDENTITY_TOKEN_FILE',
    //                     value: '/var/run/secrets/iam/token',
    //                 },
    //             },
    //             {
    //                 op: 'add',
    //                 path: '/spec/containers/0/env/-',
    //                 value: {
    //                     name: 'AWS_ROLE_ARN',
    //                     value: iamRole,
    //                 },
    //             },
    //         ],
    //     );

    //     res.send({
    //         apiVersion: 'admission.k8s.io/v1',
    //         kind: 'AdmissionReview',
    //         response: {
    //             uid: admissionReview.request.uid,
    //             allowed: true,
    //             patchType: 'JSONPatch',
    //             patch: Buffer.from(JSON.stringify(patches)).toString('base64'),
    //         },
    //     });
    // });
    // mutateWebhookServer.listen({ port: 8443, host: '0.0.0.0' }, (err) => {
    //     if (err) {
    //         console.error(err);
    //         process.exit(1);
    //     }
    // });
}

main();
