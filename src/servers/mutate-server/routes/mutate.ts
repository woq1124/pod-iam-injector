import type { V1Pod } from '@kubernetes/client-node';
import { RouteOptions } from 'fastify';
import kubeClient from '../../../libs/kube-client';
import { ISSUER_DOMAIN, NAME } from '../../../configs';
import { AdmissionReview, MutatePatch } from '../../../types';

function nonMutateResponse(uid: string): Omit<AdmissionReview, 'request'> {
    return {
        apiVersion: 'admission.k8s.io/v1',
        kind: 'AdmissionReview',
        response: { uid, allowed: true },
    };
}

export default {
    method: 'POST',
    url: '/mutate',
    handler: async (req, res) => {
        const { jsonWebKeyProvider } = req;
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

        const secretName = `${name}-web-identity-token`;

        await kubeClient.upsertNamespacedSecret(
            namespace,
            secretName,
            { token: idToken },
            {
                labels: {
                    'app.kubernetes.io/component': 'web-identity-token',
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
                name: 'web-identity-token',
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
                    name: 'web-identity-token',
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
    },
} as RouteOptions;
