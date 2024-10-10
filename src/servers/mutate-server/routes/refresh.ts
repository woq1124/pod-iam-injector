import { RouteOptions } from 'fastify';
import kubeClient from '../../../libs/kube-client';
import { NAME } from '../../../configs';

export default {
    method: 'POST',
    url: '/refresh',
    handler: async (req, res) => {
        const { jsonWebKeyProvider } = req;

        /**
         * TODO: 뭔가 이상하다. Mutate Server가 secret을 발급할 때 Fire and Forget이라서 그런 것 같다.
         * Mutate 서버에서 발급해준 secret에 대한 정보를 어딘가에 가지고 있어야한다.
         * 그래야 나중에 발급해준 secret을 list로 가져오지 않고도 patch 하거나 delete 할 수 있다.
         * 이건 CustomResourceDefinition을 만들거나 별도로 DB를 가지고 있어야 한다.
         */
        const secrets = await kubeClient.listSecret({
            labelSelector: `app.kubernetes.io/component=web-identity-token,app.kubernetes.io/managed-by=${NAME}`,
        });
        await Promise.all(
            secrets.map(async ({ name: secretName, namespace, data }) => {
                if (!secretName || !namespace || !data?.token) {
                    return;
                }

                const { payload } = await jsonWebKeyProvider.verify(data.token);

                const { sub, name, group } = payload as { sub: string; name: string; group: string };
                const idToken = await jsonWebKeyProvider.sign({ sub, name, group });

                await kubeClient.patchNamespacedSecret(namespace, secretName, { token: idToken });
            }),
        );

        res.send({ success: true });
    },
} as RouteOptions;
