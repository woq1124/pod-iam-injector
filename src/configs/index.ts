export const ISSUER_URL = process.env.ISSUER_URL ?? 'https://sts.example.com';
export const AUDIENCE = process.env.AUDIENCE ?? 'sts.amazonaws.com';
export const CERTIFICATE_PATH = process.env.CERTIFICATE_PATH ?? '/etc/webhook/certs';
export const JSON_WEB_KEY_PREFIX = process.env.JSON_WEB_KEY_PREFIX ?? 'json-web-key';
export const JSON_WEB_KEY_COUNT = process.env.JSON_WEB_KEY_COUNT ? parseInt(process.env.JSON_WEB_KEY_COUNT) : 4;
