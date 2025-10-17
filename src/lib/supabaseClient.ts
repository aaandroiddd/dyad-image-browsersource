import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type EnvSource = Record<string, string | undefined> | undefined;

const coalesceEnvValue = (
  keys: string[],
  ...sources: EnvSource[]
): string | undefined => {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  return undefined;
};

const importMetaEnv = import.meta.env as Record<string, string | undefined>;
const globalProcessEnv =
  typeof globalThis !== 'undefined' && 'process' in globalThis
    ? ((globalThis as { process?: { env?: Record<string, string | undefined> } })
        .process?.env ?? undefined)
    : undefined;

const rawSupabaseUrl = coalesceEnvValue(
  ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_URL', 'SUPABASE_URL'],
  importMetaEnv,
  globalProcessEnv
);

const supabaseAnonKey = coalesceEnvValue(
  [
    'VITE_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
  ],
  importMetaEnv,
  globalProcessEnv
);

const supabaseDomainPattern = /^[a-z0-9.-]+\.supabase\.(co|in)$/i;

const isAllowedSupabaseHost = (host: string) =>
  supabaseDomainPattern.test(host) || host === 'localhost' || host === '127.0.0.1';

const sanitizeSupabaseUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;

  const trimmed = url.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Supabase URL must use http or https');
    }
    if (!isAllowedSupabaseHost(parsed.hostname)) {
      console.error(
        'Invalid Supabase domain provided. Expected a Supabase project URL ending in .supabase.co or .supabase.in (or localhost for self-hosted setups).'
      );
      return undefined;
    }
    return parsed.origin;
  } catch {
    const projectRefPattern = /^[a-z0-9]{20}$/i;

    const inferredDomain = projectRefPattern.test(trimmed)
      ? `${trimmed}.supabase.co`
      : supabaseDomainPattern.test(trimmed)
        ? trimmed
        : undefined;

    if (!inferredDomain) {
      console.error(
        'Invalid Supabase URL provided. Expected a full https URL or project reference.'
      );
      return undefined;
    }

    console.warn(
      `Normalizing Supabase URL. Update VITE_SUPABASE_URL to "https://${inferredDomain}".`
    );

    return `https://${inferredDomain}`;
  }
};

const supabaseUrl = sanitizeSupabaseUrl(rawSupabaseUrl);

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
