import { JSON_WEB_KEY_COUNT } from './configs';
import kubeClient from './libs/kube-client';
import logger from './libs/logger';
import JsonWebKeyProvider from './libs/provider';
import launchMutateServer from './mutate-server';
import launchOidcProvider from './oidc-provider';

async function main() {
    const secrets = await kubeClient.listNamespacedSecretes('pod-iam-injector', {
        labelSelector: 'app.kubernetes.io/component=json-web-key',
    });

    if (secrets.length !== JSON_WEB_KEY_COUNT) {
        const newKeyPairs = await JsonWebKeyProvider.generateKeyPairs(JSON_WEB_KEY_COUNT - secrets.length);
        const newSecrets = await Promise.all(
            newKeyPairs.map((keyPair) =>
                kubeClient.createNamespacedSecret(
                    'pod-iam-injector',
                    `json-web-key-${keyPair.kid.substring(0, 6)}`,
                    keyPair,
                    {
                        labels: { 'app.kubernetes.io/component': 'json-web-key' },
                    },
                ),
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

    await launchOidcProvider(jsonWebKeyProvider);
    await launchMutateServer(jsonWebKeyProvider);
}

main().catch((error) => {
    logger.error(`Fail to start: ${error.message}`, { error });
    process.exit(1);
});
