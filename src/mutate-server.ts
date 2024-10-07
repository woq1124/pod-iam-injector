import fs from 'fs';
import { fastify } from 'fastify';
import type { V1Pod } from '@kubernetes/client-node';
import type JsonWebKeyProvider from './libs/provider';
import kubeClient, { KubernetesResponseError } from './libs/kube-client';
import logger from './libs/logger';
import { CERTIFICATE_PATH, ISSUER_DOMAIN, MUTATE_SEVER_PORT, NAME, NAMESPACE, REFRESH_ID_TOKEN_CRON } from './configs';
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

    mutateServer.post('/refresh', async (req, res) => {
        await kubeClient
            .listSecret({
                labelSelector: `app.kubernetes.io/component=id-token,app.kubernetes.io/managed-by=${NAME}`,
            })
            .then(async (secrets) =>
                Promise.all(
                    secrets.map(async ({ name: secretName, namespace, data }) => {
                        if (!secretName || !namespace || !data?.token) {
                            return;
                        }

                        const { payload } = await jsonWebKeyProvider.verify(data.token);

                        if (!payload.exp) {
                            return;
                        }

                        if (payload.exp * 1000 < Date.now()) {
                            const { sub, name, group } = payload as { sub: string; name: string; group: string };
                            const idToken = await jsonWebKeyProvider.sign({ sub, name, group });

                            await kubeClient.patchNamespacedSecret(namespace, secretName, { token: idToken });
                        }
                    }),
                ),
            );

        res.send({ success: true });
    });

    mutateServer.post('/mutate', async (req, res) => {
        const { request } = req.body as AdmissionReview;

        if (!request.object) {
            res.send(nonMutateResponse(request.uid));
            return;
        }

        const { metadata, spec } = request.object as V1Pod;

        if (!spec || !metadata?.annotations?.['iam.amazonaws.com/role']) {
            res.send(nonMutateResponse(request.uid));
            return;
        }

        const { namespace, annotations } = metadata;
        const { serviceAccountName } = spec;

        const iamRole = annotations['iam.amazonaws.com/role'];
        const name = annotations[`${ISSUER_DOMAIN}/name`] ?? serviceAccountName;
        const group = annotations[`${ISSUER_DOMAIN}/group`] ?? namespace;
        const containerIndies = (() => {
            const injectRequiredContainerNameSet = new Set(
                (annotations[`${ISSUER_DOMAIN}/inject-containers`] ?? '')
                    .split(',')
                    .filter(Boolean)
                    .map((containerName) => containerName.trim()),
            );

            if (!injectRequiredContainerNameSet.size) {
                return [0];
            }

            return spec.containers
                .filter(({ name: containerName }) => injectRequiredContainerNameSet.has(containerName))
                .map((_, index) => index);
        })();

        if (!name || !namespace || !group || !iamRole) {
            res.send(nonMutateResponse(request.uid));
            return;
        }

        const idToken = await jsonWebKeyProvider.sign({
            sub: `system:pod:${namespace}:${name}`,
            name,
            group,
        });

        const secretName = `${name}-id-token`;

        await kubeClient.upsertNamespacedSecret(
            namespace,
            secretName,
            { token: idToken },
            {
                labels: {
                    'app.kubernetes.io/component': 'id-token',
                    'app.kubernetes.io/managed-by': NAME,
                },
            },
        );

        const patches: MutatePatch[] = [];

        if (!spec.volumes) {
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

        for (const containerIndex of containerIndies) {
            if (!spec.containers[containerIndex].env) {
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
                        value: `/var/run/secrets/${ISSUER_DOMAIN}/token`,
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

            if (!spec.containers[containerIndex].volumeMounts) {
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
                    mountPath: `/var/run/secrets/${ISSUER_DOMAIN}`,
                },
            });
        }

        res.send({
            apiVersion: 'admission.k8s.io/v1',
            kind: 'AdmissionReview',
            response: {
                uid: request.uid,
                allowed: true,
                patchType: 'JSONPatch',
                patch: Buffer.from(JSON.stringify(patches)).toString('base64'),
            },
        });
    });

    mutateServer.setErrorHandler((error, req, res) => {
        logger.error(error.message, { error });
        res.send({ error: error.message });
    });

    mutateServer.listen({ port: MUTATE_SEVER_PORT, host: '0.0.0.0' }, (error) => {
        if (error) {
            logger.error(error.message, { error });
            process.exit(1);
        }
        logger.info(`Mutate server is listening on ${MUTATE_SEVER_PORT}`);
    });

    // TODO: 이걸 어디로 빼야할까?
    await kubeClient.getNamespacedCronJob(NAMESPACE, 'refresh-id-token').catch((error) => {
        if (error instanceof KubernetesResponseError && error.data.code === 404) {
            return kubeClient.createNamespacedCronJob(NAMESPACE, {
                metadata: {
                    name: 'refresh-id-token',
                    namespace: NAMESPACE,
                    labels: { 'app.kubernetes.io/component': 'refresh-id-token' },
                },
                spec: {
                    schedule: REFRESH_ID_TOKEN_CRON,
                    jobTemplate: {
                        spec: {
                            template: {
                                spec: {
                                    containers: [
                                        {
                                            name: 'refresh-id-token',
                                            image: 'curlimages/curl:latest',
                                            command: ['/bin/sh', '-c'],
                                            args: [
                                                `curl --k /tmp/tls.cert https://${NAME}.${NAMESPACE}.svc:443/refresh`,
                                            ],
                                        },
                                    ],
                                    restartPolicy: 'OnFailure',
                                },
                            },
                        },
                    },
                },
            });
        }

        throw error;
    });
}

export default launchMutateServer;
