/// <reference types="@cloudflare/workers-types" />
/**
 * R2 Bucket Utilities — Cloudflare R2 Object Storage helpers.
 *
 * Requires an R2 bucket binding in wrangler.json:
 * ```json
 * {
 *   "r2_buckets": [
 *     { "binding": "BUCKET", "bucket_name": "my-bucket" }
 *   ]
 * }
 * ```
 *
 * @example
 * ```ts
 * export default defineEventHandler(async (event) => {
 *   const r2 = useR2(event)
 *
 *   // Upload
 *   const file = await readMultipartFormData(event)
 *   await r2.put('uploads/photo.jpg', file[0].data, { httpMetadata: { contentType: 'image/jpeg' } })
 *
 *   // Get
 *   const object = await r2.get('uploads/photo.jpg')
 *
 *   // List
 *   const list = await r2.list({ prefix: 'uploads/' })
 *
 *   // Delete
 *   await r2.delete('uploads/photo.jpg')
 * })
 * ```
 */

import type { H3Event } from 'h3'

/// <reference types="@cloudflare/workers-types" />

/**
 * Get the R2 bucket binding from the Cloudflare event context.
 * @param event - The H3 event
 * @param bindingName - R2 binding name from wrangler.json (default: 'BUCKET')
 */
export function useR2(event: H3Event, bindingName = 'BUCKET'): R2Bucket {
  const env = event.context.cloudflare?.env
  if (!env?.[bindingName]) {
    throw createError({
      statusCode: 500,
      message: `R2 binding "${bindingName}" not found. Add it to wrangler.json.`,
    })
  }
  return env[bindingName] as R2Bucket
}

/**
 * Upload a file to R2 and return its key.
 */
export async function uploadToR2(
  event: H3Event,
  key: string,
  data: ArrayBuffer | ArrayBufferView | ReadableStream | string,
  contentType?: string,
  bindingName = 'BUCKET',
): Promise<string> {
  const r2 = useR2(event, bindingName)
  await r2.put(key, data, contentType ? { httpMetadata: { contentType } } : undefined)
  return key
}

/**
 * Delete an object from R2.
 */
export async function deleteFromR2(
  event: H3Event,
  key: string | string[],
  bindingName = 'BUCKET',
): Promise<void> {
  const r2 = useR2(event, bindingName)
  await r2.delete(key)
}

/**
 * Read an R2 object and return its content as a base64-encoded string.
 * Returns null if the object doesn't exist.
 */
export async function readR2AsBase64(
  event: H3Event,
  key: string,
  bindingName = 'BUCKET',
): Promise<string | null> {
  const r2 = useR2(event, bindingName)
  const obj = await r2.get(key)
  if (!obj) return null

  const buf = await obj.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

/**
 * Decode base64 data and upload it to R2.
 * Returns the object key for subsequent retrieval.
 */
export async function uploadBase64ToR2(
  event: H3Event,
  key: string,
  base64Data: string,
  contentType: string,
  bindingName = 'BUCKET',
): Promise<string> {
  const binary = atob(base64Data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return uploadToR2(event, key, bytes.buffer, contentType, bindingName)
}
