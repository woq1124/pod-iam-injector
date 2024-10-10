import 'fastify';
import type JsonWebKeyProvider from '../libs/provider';

declare module 'fastify' {
    export interface FastifyRequest {
        jsonWebKeyProvider: JsonWebKeyProvider;
    }
}
