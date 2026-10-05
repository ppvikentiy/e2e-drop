// Verifies that the configured S3 bucket is reachable and writable.
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../src/config.js';
import { s3, checkBucket } from '../src/s3.js';

const key = `.e2e-drop-check-${Date.now()}`;
const Bucket = config.s3.bucket;

function explain(err) {
  const code = err?.name || err?.Code || err?.code;
  const status = err?.$metadata?.httpStatusCode;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Не удаётся найти хост S3 — проверьте адрес endpoint.';
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT') return 'S3 endpoint недоступен с сервера (соединение отклонено / таймаут).';
  if (code === 'NoSuchBucket' || status === 404) return `Бакет «${Bucket}» не найден.`;
  if (code === 'InvalidAccessKeyId') return 'Неверный Access Key.';
  if (code === 'SignatureDoesNotMatch') return 'Неверный Secret Key (или неверный регион).';
  if (status === 403 || code === 'AccessDenied') return 'Доступ запрещён — у ключа нет прав на этот бакет.';
  if (status === 301 || code === 'PermanentRedirect') return 'Неверный регион бакета.';
  return `${code ?? 'Ошибка'}: ${err?.message ?? err}`;
}

async function step(label, fn) {
  process.stdout.write(`  - ${label}... `);
  try {
    await fn();
    console.log('OK');
  } catch (err) {
    console.log('FAIL');
    console.error(`    ${explain(err)}`);
    process.exit(1);
  }
}

console.log(`Проверка S3: bucket=${Bucket} endpoint=${config.s3.endpoint ?? 'AWS'} region=${config.s3.region}`);
await step('доступ к бакету', () => checkBucket());
await step('запись', () => s3.send(new PutObjectCommand({ Bucket, Key: key, Body: 'ok' })));
await step('чтение', async () => {
  const res = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
  await res.Body.transformToString();
});
await step('удаление', () => s3.send(new DeleteObjectCommand({ Bucket, Key: key })));
console.log('S3 настроен корректно.');
