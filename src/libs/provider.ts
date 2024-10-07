import * as jose from 'jose';
import { AUDIENCE, ID_TOKEN_EXPIRES_IN, ISSUER_URL } from '../configs';

type JsonWebKeyPair = {
    kid: string;
    publicKey: string;
    privateKey: string;
};

class JsonWebKeyProvider {
    constructor(private keyPairs: JsonWebKeyPair[]) {}

    async sign(payload: { sub: string; name: string; group: string }) {
        const { privateKey, kid } = this.keyPairs[Math.floor(Math.random() * this.keyPairs.length)];
        const privatePKCS8 = await jose.importPKCS8(privateKey, 'RSA');

        return new jose.SignJWT(payload)
            .setProtectedHeader({ alg: 'RS256', kid })
            .setIssuer(ISSUER_URL)
            .setAudience(AUDIENCE)
            .setIssuedAt()
            .setExpirationTime(ID_TOKEN_EXPIRES_IN) // TODO: 팟에 주입된 토큰이 만료될 텐데... 이걸 어떻게 갱신하지? 크론잡?
            .sign(privatePKCS8);
    }

    async generateJwks() {
        const jwks = await Promise.all(
            this.keyPairs.map(async ({ kid, publicKey }) => {
                const publicJwk = await jose.importSPKI(publicKey, 'RSA').then(jose.exportJWK);

                publicJwk.kid = kid;
                publicJwk.use = 'sig';
                publicJwk.alg = 'RS256';

                return publicJwk;
            }),
        );

        return { keys: jwks };
    }

    async generateWellKnownOpenIdConfiguration() {
        return {
            issuer: ISSUER_URL,
            authorization_endpoint: `${ISSUER_URL}/auth`, // NOTE: Not implemented
            token_endpoint: `${ISSUER_URL}/token`, // NOTE: Not implemented
            jwks_uri: `${ISSUER_URL}/keys`,
            response_types_supported: ['id_token'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
        };
    }

    static async generateKeyPairs(count: number) {
        return Promise.all(
            Array.from({ length: count }, async () => {
                const { publicKey, privateKey } = await jose.generateKeyPair('RS256', { modulusLength: 2048 });
                const { k = '' } = await jose.generateSecret('HS256').then(jose.exportJWK);
                const publicSPKI = await jose.exportSPKI(publicKey);
                const privatePKCS8 = await jose.exportPKCS8(privateKey);

                return {
                    kid: k,
                    publicKey: publicSPKI,
                    privateKey: privatePKCS8,
                };
            }),
        );
    }
}

export default JsonWebKeyProvider;
