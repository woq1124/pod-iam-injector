import fs from 'fs';
import { fastify } from 'fastify';
import type { V1Pod } from '@kubernetes/client-node';
import type JsonWebKeyProvider from './libs/provider';
import kubeClient from './libs/kube-client';
import logger from './libs/logger';
import { CERTIFICATE_PATH, ISSUER_URL, MUTATE_SEVER_PORT } from './configs';
import { AdmissionReview, MutatePatch } from './types';

function nonMutateResponse(uid: string): Omit<AdmissionReview, 'request'> {
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

    mutateServer.listen({ port: MUTATE_SEVER_PORT, host: '0.0.0.0' }, (error) => {
        if (error) {
            logger.error(error.message, { error });
            process.exit(1);
        }
        logger.info(`Mutate server is listening on ${MUTATE_SEVER_PORT}`);
    });

    mutateServer.post('/mutate', async (req, res) => {
        const admissionReview = req.body as AdmissionReview;

        if (!admissionReview.request.object) {
            res.send(nonMutateResponse(admissionReview.request.uid));
            return;
        }

        const podObject = admissionReview.request.object as V1Pod;

        if (!(podObject.kind !== 'Pod') || !podObject.metadata?.annotations || !podObject.spec) {
            res.send(nonMutateResponse(admissionReview.request.uid));
            return;
        }

        const { namespace, annotations } = podObject.metadata;
        const { serviceAccountName } = podObject.spec;

        const name = annotations[`${ISSUER_URL}/name`] ?? serviceAccountName;
        const group = annotations[`${ISSUER_URL}/group`] ?? namespace;
        const iamRole = annotations['iam.amazonaws.com/role'];
        const containerIndex = (() => {
            const containerName = annotations['iam.amazonaws.com/container'];
            if (!containerName) {
                return 0;
            }
            return podObject.spec.containers.findIndex((container) => container.name === containerName);
        })();

        if (!name || !namespace || !group || !iamRole) {
            res.send(nonMutateResponse(admissionReview.request.uid));
            return;
        }

        const idToken = await jsonWebKeyProvider.sign({
            sub: `system:pod:${namespace}:${name}`,
            name,
            group,
        });

        const secretName = `id-token-${name}`;

        await kubeClient.createSecret(namespace, secretName, { token: idToken });

        const patches: MutatePatch[] = [];

        if (!podObject.spec.volumes) {
            patches.push({
                op: 'add',
                path: '/spec/volumes',
                value: [],
            });
        }

        patches.push({
            op: 'add',
            path: '/spec/volumes/-',
            value: {
                name: 'id-token',
                secret: {
                    secretName,
                },
            },
        });

        if (!podObject.spec.containers[containerIndex].env) {
            patches.push({
                op: 'add',
                path: `/spec/containers/${containerIndex}/env`,
                value: [],
            });
        }

        patches.push(
            {
                op: 'add',
                path: `/spec/containers/${containerIndex}/env/-`,
                value: {
                    name: 'AWS_WEB_IDENTITY_TOKEN_FILE',
                    value: '/var/run/secrets/iam/token',
                },
            },
            {
                op: 'add',
                path: `/spec/containers/${containerIndex}/env/-`,
                value: {
                    name: 'AWS_ROLE_ARN',
                    value: iamRole,
                },
            },
        );

        if (!podObject.spec.containers[containerIndex].volumeMounts) {
            patches.push({
                op: 'add',
                path: `/spec/containers/${containerIndex}/volumeMounts`,
                value: [],
            });
        }

        patches.push({
            op: 'add',
            path: `/spec/containers/${containerIndex}/volumeMounts/-`,
            value: {
                name: 'id-token',
                mountPath: '/var/run/secrets/iam/token',
            },
        });

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
}

export default launchMutateServer;
