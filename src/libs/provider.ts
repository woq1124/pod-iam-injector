import * as jose from 'jose';
import configs from '../configs';
import kubeClient from './kube-client';

class Provider {
    keyPair?: {
        kid: string;
        publicKey: string;
        privateKey: string;
    };

    async initialize() {
        // TODO: replicas가 1 초과일 때 시크릿이 여러개 만들려고 하는 문제가 있지 않을까?
        // TODO: 시크릿을 한개만 만드는 것도 좀 이상한듯
        const secret = await kubeClient.getSecret(configs.namespace, configs.secretName);

        console.log(secret);

        if (secret) {
            this.keyPair = {
                kid: secret.kid,
                publicKey: secret.publicKey,
                privateKey: secret.privateKey,
            };
        } else {
            const { publicKey, privateKey } = await jose.generateKeyPair('RS256');
            const { k: kid = '' } = await jose.generateSecret('HS256').then(jose.exportJWK);

            const publicSPKI = await jose.exportSPKI(publicKey);
            const privatePKCS8 = await jose.exportPKCS8(privateKey);

            await kubeClient
                .createSecret(configs.namespace, configs.secretName, {
                    publicKey: publicSPKI,
                    privateKey: privatePKCS8,
                    kid,
                })
                .catch((error) => {
                    console.log(error.response.body);
                });

            this.keyPair = {
                kid,
                publicKey: publicSPKI,
                privateKey: privatePKCS8,
            };
        }
    }

    async sign({ exp, ...payload }: { sub: string; name: string; group: string; exp: string | number | Date }) {
        if (!this.keyPair) {
            throw new Error('Key pair not initialized');
        }
        const privateKey = await jose.importPKCS8(this.keyPair.privateKey, 'RSA');
        return new jose.SignJWT(payload)
            .setProtectedHeader({ alg: 'RS256', kid: this.keyPair.kid })
            .setIssuer(configs.issuerUrl)
            .setAudience(configs.audience)
            .setIssuedAt()
            .setExpirationTime(exp) // TODO: 팟에 주입된 토큰이 만료될 텐데... 이걸 어떻게 갱신하지? 크론잡?
            .sign(privateKey);
    }

    private async generateJwk() {
        if (!this.keyPair) {
            throw new Error('Key pair not initialized');
        }
        const publicKey = await jose.importSPKI(this.keyPair.publicKey, 'RSA');
        const publicJwk = await jose.exportJWK(publicKey);

        publicJwk.kid = this.keyPair.kid;
        publicJwk.use = 'sig';
        publicJwk.alg = 'RS256';
        return publicJwk;
    }

    async generateJwksUriPayload() {
        if (!this.keyPair) {
            throw new Error('Key pair not initialized');
        }
        const jwk = await this.generateJwk();
        return { keys: [jwk] };
    }

    async generateWellKnownOpenIdConfigurationPayload() {
        return {
            issuer: configs.issuerUrl,
            authorization_endpoint: `${configs.issuerUrl}/auth`, // NOTE: Not implemented
            token_endpoint: `${configs.issuerUrl}/token`, // NOTE: Not implemented
            jwks_uri: `${configs.issuerUrl}/keys`,
            response_types_supported: ['id_token'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
        };
    }
}

export default new Provider();
