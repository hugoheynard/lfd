import type { StorefrontCatalogOperation } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  inheritedBadge,
  infoPreviewText,
  isOperationShown,
  operationOptionLabel,
  operationWarning,
} from '../storefront-operations';
import { emptyInfo } from '../storefront-text';

/** Les dates ne sont comparées qu'à `now`, constante de la suite : aucune horloge. */
const NOEL: StorefrontCatalogOperation = {
  key: 'noel-2026',
  name: { fr: 'Noël 2026' },
  lede: null,
  image: null,
  state: 'open',
  // 1er novembre, 15 novembre à minuit à Paris ; 21 décembre à midi.
  announceFrom: '2026-10-31T23:00:00.000Z',
  orderFrom: '2026-11-14T23:00:00.000Z',
  orderUntil: '2026-12-21T11:00:00.000Z',
  pickupFrom: '2026-12-20',
  pickupUntil: '2026-12-24',
};

describe('les opérations de l’éditeur de vitrine', () => {
  it('nomme l’opération avec son état et ses dates, lues à Paris', () => {
    expect(operationOptionLabel(NOEL)).toBe(
      'Noël 2026 — Commandes ouvertes · commandes du 15 nov. au 21 déc., retrait du 20 déc. au 24 déc.',
    );
  });

  it('calcule la pastille que la boutique posera', () => {
    const now = new Date('2026-12-03T08:00:00.000Z');
    expect(inheritedBadge(NOEL, now)).toBe('J‑18');
    expect(inheritedBadge(NOEL, new Date('2026-12-21T06:00:00.000Z'))).toBe('Dernier jour');
    expect(inheritedBadge({ ...NOEL, state: 'announced' }, now)).toBe('Dès le 15 nov.');
    expect(inheritedBadge({ ...NOEL, state: 'closed' }, now)).toBe('Commandes closes');
    expect(inheritedBadge({ ...NOEL, state: 'ended' }, now)).toBeNull();
  });

  it('signale l’opération que la boutique ne montre pas, et se tait sinon', () => {
    const ops = (state: StorefrontCatalogOperation['state']) => [{ ...NOEL, state }];
    expect(operationWarning(ops('open'), 'noel-2026')).toBeNull();
    expect(operationWarning(ops('closed'), 'noel-2026')).toBeNull();
    expect(operationWarning(ops('ended'), 'noel-2026')).toBe(
      'Opération terminée — l’annonce ne s’affiche plus',
    );
    expect(operationWarning(ops('hidden'), 'noel-2026')).toContain('masquée à la réception');
    expect(operationWarning(ops('preparing'), 'noel-2026')).toContain('à partir du 1 nov.');
    expect(operationWarning([], 'noel-2026')).toContain('inconnue du catalogue');
    expect(isOperationShown(ops('announced'), 'noel-2026')).toBe(true);
    expect(isOperationShown(ops('preparing'), 'noel-2026')).toBe(false);
  });

  it('l’aperçu dit la pastille et le titre hérités', () => {
    const info = { ...emptyInfo(), operationKey: 'noel-2026' };
    const now = new Date('2026-12-03T08:00:00.000Z');
    expect(infoPreviewText(info, [NOEL], now)).toBe('J‑18 · Noël 2026');
    expect(infoPreviewText({ ...info, title: { fr: 'Les bûches' } }, [NOEL], now)).toBe(
      'J‑18 · Les bûches',
    );
    expect(infoPreviewText(emptyInfo(), [NOEL], now)).toBe('Sans titre');
  });
});
