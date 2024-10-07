import { fastify } from 'fastify';
import type JsonWebKeyProvider from './libs/provider';
import { OIDC_PROVIDER_SERVER_PORT } from './configs';
import logger from './libs/logger';

async function launchOidcProvider(jsonWebKeyProvider: JsonWebKeyProvider) {
    const openIdConfiguration = await jsonWebKeyProvider.generateWellKnownOpenIdConfiguration();
    const jwks = await jsonWebKeyProvider.generateJwks();

    const oidcProvider = fastify();

    oidcProvider.get('/healthz', async (_req, res) => {
        res.send('ok');
    });
    oidcProvider.get('/.well-known/openid-configuration', async (_req, res) => {
        res.send(openIdConfiguration);
    });
    oidcProvider.get('/keys', async (_req, res) => {
        res.send(jwks);
    });

    oidcProvider.listen({ port: OIDC_PROVIDER_SERVER_PORT, host: '0.0.0.0' }, (error) => {
        if (error) {
            logger.error(error.message, { error });
            process.exit(1);
        }
        logger.info(`OIDC provider is listening on ${OIDC_PROVIDER_SERVER_PORT}`);
    });
}

export default launchOidcProvider;
