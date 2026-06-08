// Upload gambar ke Cloudflare R2 (S3-compatible) pakai aws4fetch — ringan,
// ga ada native module (penting biar Dockerfile tetep simpel).
//
// Config via env (di-set di Coolify):
//   R2_ACCOUNT_ID         - Cloudflare account id
//   R2_ACCESS_KEY_ID      - R2 API token access key
//   R2_SECRET_ACCESS_KEY  - R2 API token secret key
//   R2_BUCKET             - nama bucket
//   R2_PUBLIC_BASE        - base URL publik bucket (mis. https://img.hanif.app)
import { AwsClient } from 'aws4fetch';
import { nanoid } from 'nanoid';

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_BASE,
} = process.env;

// Tipe gambar yang diizinkan -> ekstensi file. SVG sengaja ga didukung
// (vektor bisa nyimpen script -> risiko XSS walau di-serve dari domain lain).
export const ALLOWED_IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

// Semua config kepasang? Kalau ga, fitur upload dimatiin (graceful).
export function r2Configured() {
  return Boolean(
    R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_BASE
  );
}

let _client = null;
function client() {
  if (!_client) {
    _client = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      region: 'auto',
      service: 's3',
    });
  }
  return _client;
}

function publicUrl(key) {
  return `${R2_PUBLIC_BASE.replace(/\/+$/, '')}/${key}`;
}

// Upload buffer gambar ke R2, balikin { url, key }. Lempar error kalau gagal.
export async function uploadImage({ buffer, contentType, userId }) {
  const ext = ALLOWED_IMAGE_TYPES[contentType];
  if (!ext) throw new Error('Tipe gambar ga didukung.');
  if (!buffer?.length) throw new Error('File kosong.');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Gambar kegedean (maks 10MB).');

  // Prefix per-user biar gampang ditelusuri; nama acak biar ga ketebak.
  const key = `u${userId}/${nanoid(16)}.${ext}`;
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;

  const res = await client().fetch(endpoint, {
    method: 'PUT',
    body: buffer,
    headers: {
      'Content-Type': contentType,
      // Aset gambar immutable (nama acak) -> cache lama.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`R2 upload gagal (${res.status}). ${detail.slice(0, 200)}`);
  }

  return { url: publicUrl(key), key };
}
