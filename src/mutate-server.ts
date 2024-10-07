import fs from 'fs';
import { fastify } from 'fastify';
import type { V1Pod } from '@kubernetes/client-node';
import type JsonWebKeyProvider from './libs/provider';
import logger from './libs/logger';
import { CERTIFICATE_PATH, MUTATE_SEVER_PORT } from './configs';
import { AdmissionReview } from './types';

function nonMutatingResponse(uid: string): Omit<AdmissionReview, 'request'> {
    return {
        apiVersion: 'admission.k8s.io/v1',
        kind: 'AdmissionReview',
        response: { uid, allowed: true },
    };
}

async function launchMutateServer(jsonWebKeyProvider: JsonWebKeyProvider) {
    const tlsKey = fs.readFileSync(`${CERTIFICATE_PATH}/tls.key`, 'utf8');
    const tlsCert = fs.readFileSync(`${CERTIFICATE_PATH}/tls.crt`, 'utf8');

    const mutateServer = fastify({ https: { key: tlsKey, cert: tlsCert } });

    mutateServer.listen({ port: MUTATE_SEVER_PORT }, (error) => {
        if (error) {
            logger.error(error.message, { error });
            process.exit(1);
        }
        logger.info(`Mutate server is listening on ${MUTATE_SEVER_PORT}`);
    });

    mutateServer.post('/mutate', async (req, res) => {
        const admissionReview = req.body as AdmissionReview;

        if (!admissionReview.request.object) {
            logger.warn('No object in admission review request');
            res.send(nonMutatingResponse(admissionReview.request.uid));
            return;
        }

        const podSpec = admissionReview.request.object as V1Pod;

        if (!podSpec.metadata) {
            logger.warn('No metadata in pod spec');
            res.send(nonMutatingResponse(admissionReview.request.uid));
            return;
        }

        const { name, generateName, namespace, annotations } = podSpec.metadata;
        console.log(podSpec);

        res.send(nonMutatingResponse(admissionReview.request.uid));
    });
}

export default launchMutateServer;

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
