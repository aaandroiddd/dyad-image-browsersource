import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = (import.meta.env
  .VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const sanitizeSupabaseUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;

  const trimmed = url.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Supabase URL must use http or https');
    }
    return parsed.origin;
  } catch {
    const projectRefPattern = /^[a-z0-9]{20}$/i;
    const supabaseDomainPattern = /^[a-z0-9.-]+\.supabase\.(co|in)$/i;

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
