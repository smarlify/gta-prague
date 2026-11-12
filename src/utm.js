/** Outbound tracking, same shape as Playful: source + medium + campaign. */
export const UTM_SOURCE = 'gtapraha';
export const UTM_MEDIUM = 'referral';

/**
 * Merge Smarlify/Playful-style UTMs onto an absolute http(s) URL.
 * Keeps every existing query param; only fills utm_* when missing.
 */
export function withUtm(url, campaign = 'game') {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return raw;
  if (!parsed.searchParams.has('utm_source')) parsed.searchParams.set('utm_source', UTM_SOURCE);
  if (!parsed.searchParams.has('utm_medium')) parsed.searchParams.set('utm_medium', UTM_MEDIUM);
  if (!parsed.searchParams.has('utm_campaign')) {
    const tag = String(campaign ?? '').trim() || 'game';
    parsed.searchParams.set('utm_campaign', tag);
  }
  return parsed.toString();
}
