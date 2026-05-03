import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { log } from '../utils/logger';

const { endpoint, region, accessKey: accessKeyId, secretKey: secretAccessKey, bucket } = config.storage;

const s3Client = new S3Client({
  region,
  endpoint: endpoint ? (endpoint.startsWith('http') ? endpoint : `https://${endpoint}`) : undefined,
  credentials: { accessKeyId, secretAccessKey },
  // Necessário para MinIO e Cloudflare R2 (path style vs virtual hosted style)
  forcePathStyle: !endpoint.includes('amazonaws.com'),
});

/**
 * Faz upload de um arquivo para o object storage e retorna a URL pública.
 *
 * @param buffer   - Conteúdo do arquivo como Buffer
 * @param mimetype - MIME type (ex: "image/jpeg", "audio/ogg")
 * @param filename - Nome original do arquivo (usado para deduzir extensão)
 * @returns URL pública do arquivo no storage
 */
export async function uploadFile(buffer: Buffer, mimetype: string, filename?: string): Promise<string> {
  if (!config.storage.enabled) {
    throw new Error('Object storage não configurado. Defina STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY e STORAGE_SECRET_KEY.');
  }

  const ext = filename ? filename.split('.').pop() : mimetype.split('/')[1] || 'bin';
  const key = `${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    ACL: 'public-read',
  });

  await s3Client.send(command);

  const baseUrl = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
  const url = `${baseUrl}/${bucket}/${key}`;

  log.ok(`[storage] Upload: ${key} (${(buffer.length / 1024).toFixed(1)} KB) → ${url}`);

  return url;
}

/**
 * Remove um arquivo do object storage pela URL pública.
 *
 * @param url - URL pública retornada pelo uploadFile
 */
export async function deleteFile(url: string): Promise<void> {
  if (!url || !config.storage.enabled) return;

  try {
    const key = url.split('/').pop();
    if (!key) return;

    const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
    await s3Client.send(command);

    log.ok(`[storage] Deletado: ${key}`);
  } catch (error) {
    log.error('[storage] Erro ao deletar arquivo do S3', error);
  }
}
