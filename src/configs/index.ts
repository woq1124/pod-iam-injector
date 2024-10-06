const config = {
    issuerUrl: process.env.ISSUER_URL ?? 'https://auth.example.com',
    audience: process.env.AUDIENCE ?? 'sts.amazonaws.com',
    host: process.env.HOST ?? '0.0.0.0',
    port: Number(process.env.PORT) || 3000,
    namespace: process.env.NAMESPACE ?? 'pod-iam-injector',
    podName: process.env.POD_NAME ?? 'pod-iam-injector',
    secretName: process.env.SECRET_NAME ?? 'jwt-key-pair',
    certificatePath: process.env.CERTIFICATE_PATH ?? '/etc/webhook/certs',
};

export default config;
