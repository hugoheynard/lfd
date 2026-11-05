import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ERASED_ON_SIGN_OUT, isAppKey, KEPT_ON_SIGN_OUT, matches } from './stored-keys';

/** Le dossier `src/app`, relu depuis le répertoire de lancement des tests. */
const APP = join(process.cwd(), 'src', 'app');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sources(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.includes('.fixture')
      ? [path]
      : [];
  });
}

/**
 * Les clés écrites dans les sources : les constantes `const …KEY = '…'` (les
 * accès directs à `localStorage`/`sessionStorage` passent tous par l'une
 * d'elles, relevé du 2026-11-05), préfixées par `lfc.` pour celles qui passent
 * par `client/local-store.ts`.
 */
function writtenKeys(): string[] {
  const found = new Set<string>();
  for (const file of sources(APP)) {
    const text = readFileSync(file, 'utf8');
    const local = /local-store'/.test(text) || file.endsWith('local-store.ts');
    for (const match of text.matchAll(/const [A-Z_]*KEY\s*=\s*'([^']+)'/g)) {
      const raw = match[1] ?? '';
      found.add(local && !raw.startsWith('lfc') ? `lfc.${raw}` : raw);
    }
  }
  return [...found].sort();
}

const classified = (key: string): boolean =>
  matches(ERASED_ON_SIGN_OUT, key) || matches(KEPT_ON_SIGN_OUT, key);

describe('les clés du navigateur — toutes classées', () => {
  it('le relevé des sources trouve les clés attendues (le relevé lui-même marche)', () => {
    const keys = writtenKeys();
    for (const expected of [
      'lfc.cart',
      'lfc.order.choice',
      'lfc.orders',
      'lfc-last-connection',
      'lfc-invitation-expired',
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it('chaque clé écrite par l’app est effacée ou gardée — aucune n’est oubliée', () => {
    const unclassified = writtenKeys().filter((key) => isAppKey(key) && !classified(key));
    expect(unclassified).toEqual([]);
  });

  it('les clés composées par espace sont classées comme leur racine', () => {
    expect(matches(ERASED_ON_SIGN_OUT, 'lfc.cart.ws.cmp_a.units')).toBe(true);
    expect(matches(KEPT_ON_SIGN_OUT, 'lfc.orders.cmp_a')).toBe(true);
    expect(matches(KEPT_ON_SIGN_OUT, 'lfc.order-attempt.cmp_a.voucher.v1')).toBe(true);
    expect(matches(KEPT_ON_SIGN_OUT, 'lfc.cart-awaiting-payment.cmp_a')).toBe(true);
    expect(matches(ERASED_ON_SIGN_OUT, 'lfc.cart-awaiting-payment.cmp_a')).toBe(false);
  });

  it('aucune clé n’est à la fois effacée et gardée', () => {
    const exacts = ERASED_ON_SIGN_OUT.flatMap((rule) => (rule.exact ? [rule.exact] : []));
    expect(exacts.filter((key) => matches(KEPT_ON_SIGN_OUT, key))).toEqual([]);
  });
});
