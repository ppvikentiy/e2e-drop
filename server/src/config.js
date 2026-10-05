import path from 'node:path';
import { fileURLToPath } from 'node:url';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} is required`);
  return value;
}

const MB = 1024 * 1024;

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  databaseUrl: required('DATABASE_URL'),
  appSecret: required('APP_SECRET'),
  // Optional password for the whole site (set by the deploy script); empty: the site is open.
  sitePasswordHash: process.env.SITE_PASSWORD_HASH || '',
  s3: {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || 'us-east-1',
    bucket: required('S3_BUCKET'),
    accessKeyId: required('S3_ACCESS_KEY'),
    secretAccessKey: required('S3_SECRET_KEY'),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  },
  limits: {
    maxFileSize: 500 * MB,
    maxFiles: 10,
    maxDownloads: 1000,
  },
  expiryDays: { '1d': 1, '3d': 3, '7d': 7, '30d': 30 },
  staticDir:
    process.env.STATIC_DIR ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist'),
};
