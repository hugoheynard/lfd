import { describe, expect, it } from 'vitest';

import { ulid } from '../ulid';

/** Le motif que le serveur exige (`renderQualityCheckSchema`). */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

describe('ulid', () => {
  it('rend 26 caractères de l’alphabet de Crockford', () => {
    expect(ulid()).toMatch(ULID);
  });

  it('encode l’instant en tête : deux instants se trient dans l’ordre', () => {
    const zeros = (length: number): Uint8Array => new Uint8Array(length);
    const earlier = ulid(1_700_000_000_000, zeros);
    const later = ulid(1_700_000_000_001, zeros);
    expect(earlier < later).toBe(true);
    expect(ulid(0, zeros)).toBe('0'.repeat(26));
  });

  it('tire un aléa différent à chaque appel', () => {
    expect(ulid(1)).not.toBe(ulid(1));
  });
});
