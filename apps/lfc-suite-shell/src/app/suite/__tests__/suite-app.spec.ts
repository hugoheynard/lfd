import { describe, expect, it } from 'vitest';

import { appUrlFor, SUITE_ALLOWED_ORIGINS } from '../suite-app';

describe('suite-app helpers', () => {
  // Les tests tournent en config `development` → suite-config.dev.ts (localhost).
  it('résout l’URL d’une app déclarée', () => {
    expect(appUrlFor('pim')).toBe('http://localhost:7315');
  });

  it('rend undefined pour une app sans URL (stub)', () => {
    expect(appUrlFor('b2b-admin')).toBeUndefined();
    expect(appUrlFor('inconnue')).toBeUndefined();
  });

  it('dérive l’allowlist d’origines depuis les URLs d’apps', () => {
    expect(SUITE_ALLOWED_ORIGINS.has('http://localhost:7315')).toBe(true);
    expect(SUITE_ALLOWED_ORIGINS.has('https://evil.example.com')).toBe(false);
  });
});
