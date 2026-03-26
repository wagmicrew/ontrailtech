const BASE_DOMAIN = 'ontrail.tech';
const RESERVED_SUBDOMAINS = new Set(['app', 'api', 'www']);

/**
 * Extracts a runner username from a wildcard subdomain hostname.
 * Returns the lowercase username for `{username}.ontrail.tech`,
 * or null for reserved/non-runner hostnames.
 */
export function resolveRunnerFromSubdomain(hostname: string): string | null {
  const normalized = hostname.toLowerCase().trim();

  if (!normalized.endsWith(`.${BASE_DOMAIN}`)) {
    return null;
  }

  const prefix = normalized.slice(0, -(BASE_DOMAIN.length + 1));

  if (!prefix || prefix.includes('.')) {
    return null;
  }

  if (RESERVED_SUBDOMAINS.has(prefix)) {
    return null;
  }

  return prefix;
}
