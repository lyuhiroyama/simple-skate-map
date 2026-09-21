import { supabaseAdmin } from '../supabase.js';

type SignedRow = {
  path?: string;
  signedUrl?: string;
  signedURL?: string;
};

/** Sign many storage paths in one Storage API call. */
export async function signPaths(
  bucket: string,
  paths: string[],
  expiresIn = 60 * 60,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrls(unique, expiresIn);
  if (error) {
    console.error('createSignedUrls', bucket, error);
    return map;
  }

  for (let i = 0; i < (data ?? []).length; i += 1) {
    const row = (data ?? [])[i] as SignedRow;
    const url = row.signedUrl ?? row.signedURL;
    if (!url) continue;
    map.set(unique[i], url);
    if (row.path) map.set(row.path, url);
  }
  return map;
}
