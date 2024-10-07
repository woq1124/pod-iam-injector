import fs from 'fs';

export const NAME = process.env.NAME ?? 'pod-iam-injector';
export const NAMESPACE =
    process.env.NAMESPACE ?? fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/namespace', 'utf8');
export const ISSUER_DOMAIN = process.env.ISSUER_DOMAIN ?? 'sts.example.com';
export const ISSUER_URL = `https://${ISSUER_DOMAIN}`;
export const AUDIENCE = process.env.AUDIENCE ?? 'sts.amazonaws.com';
export const CERTIFICATE_PATH = process.env.CERTIFICATE_PATH ?? '/etc/webhook/certs';
export const JSON_WEB_KEY_PREFIX = process.env.JSON_WEB_KEY_PREFIX ?? 'json-web-key';
export const JSON_WEB_KEY_COUNT = process.env.JSON_WEB_KEY_COUNT ? parseInt(process.env.JSON_WEB_KEY_COUNT) : 4;
export const ID_TOKEN_EXPIRES_IN = process.env.ID_TOKEN_EXPIRES_IN ?? '25h';
export const OIDC_PROVIDER_SERVER_PORT = 8080;
export const MUTATE_SEVER_PORT = 8443;
export const REFRESH_ID_TOKEN_CRON = process.env.REFRESH_ID_TOKEN_CRON ?? '0 18 * * *';
