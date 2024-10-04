import { fastify } from 'fastify';
import configs from './configs';
import provider from './libs/provider';
import { AdmissionReview } from './types';

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
        const pod = admissionReview.request?.object;
        const annotations = pod?.metadata?.annotations ?? {};

        if (!annotations['iam.amazonaws.com/role']) {
            res.send({
                apiVersion: 'admission.k8s.io/v1',
                kind: 'AdmissionReview',
                response: {
                    uid: admissionReview.request?.uid,
                    allowed: true,
                },
            });
            return;
        }

        const iamRole: string = annotations['iam.amazonaws.com/role'];
    });

    server.listen({ port: configs.port, host: configs.host }, (address) => {
        console.log(`Server listening at ${address}`);
    });
}

main();
