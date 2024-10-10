import { NAMESPACE } from './configs';
import kubeClient from './libs/kube-client';
import JsonWebKeyProvider from './libs/provider';

async function initializeJsonWebKeyProvider() {
    const secrets = await kubeClient.listNamespacedSecretes(NAMESPACE, {
        labelSelector: 'app.kubernetes.io/component=secret-key-pair',
    });

    if (!secrets.every((secret) => secret.data?.kid && secret.data?.publicKey && secret.data?.privateKey)) {
        throw new Error('Failed to get secret key pair');
    }

    const jsonWebKeyProvider = await JsonWebKeyProvider.of(
        secrets.map((secret) => ({
            kid: secret.data!.kid,
            publicKey: secret.data!.publicKey,
            privateKey: secret.data!.privateKey,
        })),
    );

    await jsonWebKeyProvider.getKeyPairs().then((keyPairs) =>
        Promise.all(
            keyPairs.map((keyPair) => {
                kubeClient.upsertNamespacedSecret(
                    NAMESPACE,
                    `secret-key-pair-${keyPair.kid.substring(0, 6).toLowerCase()}`,
                    keyPair,
                    { labels: { 'app.kubernetes.io/component': 'secret-key-pair' } },
                );
            }),
        ),
    );

    return jsonWebKeyProvider;
}

export default initializeJsonWebKeyProvider;
