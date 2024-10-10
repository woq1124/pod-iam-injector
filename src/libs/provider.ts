import * as jose from 'jose';
import { AUDIENCE, ID_TOKEN_EXPIRES_IN, ISSUER_URL, JSON_WEB_KEY_COUNT } from '../configs';
import logger from './logger';

type SecretKeyPair = {
    kid: string;
    publicKey: string;
    privateKey: string;
};

class JsonWebKeyProvider {
    constructor(private keySets: Record<string, { publicKey: jose.KeyLike; privateKey: jose.KeyLike }>) {}

    async sign(payload: { sub: string; name: string; group: string }) {
        const kid = Object.keys(this.keySets)[Math.floor(Math.random() * JSON_WEB_KEY_COUNT)];

        return new jose.SignJWT(payload)
            .setProtectedHeader({ alg: 'RS256', kid })
            .setIssuer(ISSUER_URL)
            .setAudience(AUDIENCE)
            .setIssuedAt()
            .setExpirationTime(ID_TOKEN_EXPIRES_IN) // TODO: 팟에 주입된 토큰이 만료될 텐데... 이걸 어떻게 갱신하지? 크론잡?
            .sign(this.keySets[kid].privateKey);
    }

    async verify(token: string) {
        return jose.jwtVerify(token, async (header) => this.keySets[header.kid!].publicKey);
    }

    async getKeyPairs() {
        return Promise.all(
            Object.entries(this.keySets).map(async ([kid, { publicKey, privateKey }]) => {
                const publicSPKI = await jose.exportSPKI(publicKey);
                const privatePKCS8 = await jose.exportPKCS8(privateKey);
                return {
                    kid,
                    publicKey: publicSPKI,
                    privateKey: privatePKCS8,
                };
            }),
        );
    }

    async generateJwks() {
        return Promise.all(
            Object.entries(this.keySets).map(async ([kid, { publicKey }]) => {
                const publicJwk = await jose.exportJWK(publicKey);
                publicJwk.kid = kid;
                publicJwk.use = 'sig';
                publicJwk.alg = 'RS256';

                return publicJwk;
            }),
        );
    }

    static async of(secrets: SecretKeyPair[]) {
        const keyPairs = await Promise.all(
            secrets.map(async ({ kid, publicKey, privateKey }) => {
                const publicSPKI = await jose.importSPKI(publicKey, 'RSA');
                const privatePKCS8 = await jose.importPKCS8(privateKey, 'RSA');
                return {
                    kid,
                    publicKey: publicSPKI,
                    privateKey: privatePKCS8,
                };
            }),
        );
        const newKeyPairs = await Promise.all(
            Array.from({ length: JSON_WEB_KEY_COUNT - secrets.length }, async () => {
                const { publicKey, privateKey } = await jose.generateKeyPair('RS256', { modulusLength: 2048 });
                const { k = '' } = await jose.generateSecret('HS256').then(jose.exportJWK);

                return {
                    kid: k,
                    publicKey,
                    privateKey,
                };
            }),
        );
        logger.debug('Key pairs are loaded', { keyPairs });
        logger.debug('New key pairs are generated', { newKeyPairs });

        return new JsonWebKeyProvider(
            [...keyPairs, ...newKeyPairs].reduce(
                (acc, { kid, publicKey, privateKey }) => ({ ...acc, [kid]: { publicKey, privateKey } }),
                {} as Record<string, { publicKey: jose.KeyLike; privateKey: jose.KeyLike }>,
            ),
        );
    }
}

export default JsonWebKeyProvider;
