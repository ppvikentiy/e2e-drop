import { Transform, pipeline } from 'node:stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { config } from './config.js';
import { HttpError } from './errors.js';

const { bucket } = config.s3;

export const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  forcePathStyle: config.s3.forcePathStyle,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  // Many S3-compatible providers reject the newer default checksum headers.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export async function uploadStream(key, source, expectedSize) {
  if (expectedSize === 0) {
    source.resume();
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.alloc(0) }));
    return;
  }

  let received = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (received > expectedSize) return cb(new HttpError(400, 'Файл больше заявленного размера'));
      cb(null, chunk);
    },
  });
  const body = pipeline(source, counter, () => {});

  const upload = new Upload({
    client: s3,
    params: { Bucket: bucket, Key: key, Body: body, ContentType: 'application/octet-stream' },
    partSize: 8 * 1024 * 1024,
    queueSize: 2,
  });
  await upload.done();

  if (received !== expectedSize) {
    await deleteObject(key).catch(() => {});
    throw new HttpError(400, 'Файл загружен не полностью');
  }
}

export async function getObjectStream(key, range) {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, Range: range ? `bytes=${range.start}-${range.end}` : undefined }),
  );
  return res.Body;
}

export async function deleteObject(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function checkBucket() {
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
}

export async function startMultipart(key) {
  const res = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: 'application/octet-stream' }));
  return res.UploadId;
}

// Buffers the chunk into memory to compute Content-Length; S3 requires a known length per part.
export async function uploadPart(key, uploadId, partNumber, source, expectedSize) {
  const chunks = [];
  let received = 0;
  for await (const buf of source) {
    received += buf.length;
    if (received > expectedSize) throw new HttpError(400, 'Кусок больше заявленного размера');
    chunks.push(buf);
  }
  if (received !== expectedSize) throw new HttpError(400, 'Кусок получен не полностью');
  const body = Buffer.concat(chunks, received);
  const res = await s3.send(
    new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber, Body: body, ContentLength: received }),
  );
  return res.ETag;
}

export async function listParts(key, uploadId) {
  const parts = [];
  let marker;
  for (;;) {
    const res = await s3.send(
      new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }),
    );
    for (const p of res.Parts ?? []) parts.push({ PartNumber: p.PartNumber, ETag: p.ETag });
    if (!res.IsTruncated) break;
    marker = res.NextPartNumberMarker;
  }
  return parts.sort((a, b) => a.PartNumber - b.PartNumber);
}

export async function completeMultipart(key, uploadId, parts) {
  await s3.send(
    new CompleteMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } }),
  );
}

export async function abortMultipart(key, uploadId) {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
}
