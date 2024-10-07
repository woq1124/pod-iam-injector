import * as jose from 'jose';
import { AUDIENCE, ID_TOKEN_EXPIRES_IN, ISSUER_URL } from '../configs';

type JsonWebKeyPair = {
    kid: string;
    publicKey: string;
    privateKey: string;
};

class JsonWebKeyProvider {
    private keySets?: Record<string, { publicKey: jose.KeyLike; privateKey: jose.KeyLike }>;

    constructor(private keyPairs: JsonWebKeyPair[]) {}

    async getKeySets() {
        if (!this.keySets) {
            this.keySets = await Promise.all(
                this.keyPairs.map(async ({ kid, publicKey, privateKey }) => {
                    const publicSPKI = await jose.importSPKI(publicKey, 'RSA');
                    const privatePKCS8 = await jose.importPKCS8(privateKey, 'RSA');

                    return {
                        kid,
                        publicKey: publicSPKI,
                        privateKey: privatePKCS8,
                    };
                }),
            ).then((keyList) => {
                return keyList.reduce(
                    (acc, { kid, publicKey, privateKey }) => {
                        return { ...acc, [kid]: { publicKey, privateKey } };
                    },
                    {} as Record<string, { publicKey: jose.KeyLike; privateKey: jose.KeyLike }>,
                );
            });
        }
        return this.keySets;
    }

    async sign(payload: { sub: string; name: string; group: string }) {
        const { kid } = this.keyPairs[Math.floor(Math.random() * this.keyPairs.length)];
        const keySets = await this.getKeySets();

        return new jose.SignJWT(payload)
            .setProtectedHeader({ alg: 'RS256', kid })
            .setIssuer(ISSUER_URL)
            .setAudience(AUDIENCE)
            .setIssuedAt()
            .setExpirationTime(ID_TOKEN_EXPIRES_IN) // TODO: 팟에 주입된 토큰이 만료될 텐데... 이걸 어떻게 갱신하지? 크론잡?
            .sign(keySets[kid].privateKey);
    }

    async verify(idToken: string) {
        return jose.jwtVerify(idToken, async (header) => {
            const { kid } = header as { kid: string };
            const keySets = await this.getKeySets();

            return keySets[kid].publicKey;
        });
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
