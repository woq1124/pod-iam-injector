import fs from 'fs';
import { fastify } from 'fastify';
import type JsonWebKeyProvider from '../../libs/provider';
import logger from '../../libs/logger';
import { CERTIFICATE_PATH, MUTATE_SEVER_PORT } from '../../configs';
import { mutateRoute, refreshRoute } from './routes';

const tlsKey = fs.readFileSync(`${CERTIFICATE_PATH}/tls.key`, 'utf8');
const tlsCert = fs.readFileSync(`${CERTIFICATE_PATH}/tls.crt`, 'utf8');

async function launchMutateServer(jsonWebKeyProvider: JsonWebKeyProvider) {
    const server = fastify({ https: { key: tlsKey, cert: tlsCert } });

    server.addHook('onRequest', (request, _reply, done) => {
        request.jsonWebKeyProvider = jsonWebKeyProvider;
        done();
    });

    server.addHook('onResponse', (request, reply, done) => {
        logger.info(`${request.method} ${request.url} ${reply.statusCode}`);
        done();
    });

    server.setErrorHandler((error, _req, res) => {
        logger.error(error.message, { error });
        res.send({ error: error.message });
    });

    server.route(mutateRoute);
    server.route(refreshRoute);

    server.listen({ port: MUTATE_SEVER_PORT, host: '0.0.0.0' }, (error) => {
        if (error) {
            logger.error(error.message, { error });
            process.exit(1);
        }
        logger.info(`Mutate server is listening on ${MUTATE_SEVER_PORT}`);
    });
}

export default launchMutateServer;
