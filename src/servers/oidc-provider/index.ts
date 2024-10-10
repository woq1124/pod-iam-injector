import { fastify } from 'fastify';
import logger from '../../libs/logger';
import type JsonWebKeyProvider from '../../libs/provider';
import { ISSUER_URL, OIDC_PROVIDER_SERVER_PORT } from '../../configs';

async function launchOidcProvider(jsonWebKeyProvider: JsonWebKeyProvider) {
    const jwks = await jsonWebKeyProvider.generateJwks();

    const server = fastify();

    server.addHook('onResponse', (request, reply, done) => {
        logger.info(`${request.method} ${request.url} ${reply.statusCode}`);
        done();
    });

    server.get('/healthz', async (_req, res) => {
        res.send('ok');
    });

    server.get('/.well-known/openid-configuration', async (_req, res) => {
        res.send({
            issuer: ISSUER_URL,
            authorization_endpoint: `${ISSUER_URL}/auth`, // NOTE: Not implemented
            token_endpoint: `${ISSUER_URL}/token`, // NOTE: Not implemented
            jwks_uri: `${ISSUER_URL}/keys`,
            response_types_supported: ['id_token'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            claims_supported: ['iss', 'sub', 'aud', 'iat', 'exp', 'name', 'group'],
        });
    });

    server.get('/keys', async (_req, res) => {
        res.send({ keys: jwks });
    });

    server.setErrorHandler((error, _req, res) => {
        logger.error(error.message, { error });
        res.send({ error: error.message });
    });

    server.listen({ port: OIDC_PROVIDER_SERVER_PORT, host: '0.0.0.0' }, (error) => {
        if (error) {
            logger.error(error.message, { error });
            process.exit(1);
        }
        logger.info(`OIDC provider is listening on ${OIDC_PROVIDER_SERVER_PORT}`);
    });
}

export default launchOidcProvider;
