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
        const secret = await kubeClient.getSecret(configs.namespace, configs.secretName);

        if (secret) {
            this.keyPair = {
                kid: secret.kid,
                publicKey: secret.publicKey,
                privateKey: secret.privateKey,
            };

            return { key: secret.privateKey, cert: secret.publicKey };
        } else {
            console.log('Secret not found, generating new key pair');
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

            return { key: privatePKCS8, cert: publicSPKI };
        }
    }

    async sign(payload: { sub: string; name: string; group: string }) {
        if (!this.keyPair) {
            throw new Error('Key pair not initialized');
        }
        const privateKey = await jose.importPKCS8(this.keyPair.privateKey, 'RSA');
        return new jose.SignJWT(payload)
            .setProtectedHeader({ alg: 'RS256', kid: this.keyPair.kid })
            .setIssuer(configs.issuerUrl)
            .setAudience(configs.audience)
            .setIssuedAt()
            .sign(privateKey);
    }

    async decode(token: string) {
        if (!this.keyPair) {
            throw new Error('Key pair not initialized');
        }
        const publicKey = await jose.importSPKI(this.keyPair.publicKey, 'RSA');
        return jose.jwtVerify(token, publicKey);
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
