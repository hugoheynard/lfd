import type { CommerceOperationView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  badgeLabel,
  badgeOf,
  isNotAtCommerce,
  shopDisplayPhrase,
  splitArchived,
} from '../commerce-operation-format';
import { commerceOperation } from '../commerce-operation.testing';

describe('commerce-operation-format', () => {
  it("dit « Archivée » avant l'état calculé", () => {
    expect(badgeLabel(badgeOf({ state: 'open', archivedAt: '2026-10-01T10:00:00.000Z' }))).toBe(
      'Archivée',
    );
    expect(badgeLabel(badgeOf({ state: 'open', archivedAt: null }))).toBe('Commandes ouvertes');
  });

  it("dit ce que verra le client d'une opération sans article", () => {
    expect(shopDisplayPhrase('announcement_only')).toBe(
      "En boutique : l'annonce seule, sans produit",
    );
  });

  it('range les archivées à part, sans changer leur ordre', () => {
    const views: CommerceOperationView[] = [
      commerceOperation({ key: 'a' }),
      commerceOperation({ key: 'b', archivedAt: '2026-10-01T10:00:00.000Z' }),
      commerceOperation({ key: 'c' }),
    ];
    const { live, archived } = splitArchived(views);
    expect(live.map((view) => view.key)).toEqual(['a', 'c']);
    expect(archived.map((view) => view.key)).toEqual(['b']);
  });

  it("reconnaît l'interrupteur fermé à son code, pas à son message", () => {
    expect(isNotAtCommerce({ error: { code: 'operations.not_at_commerce', message: '…' } })).toBe(
      true,
    );
    expect(isNotAtCommerce({ error: { code: 'operations.writing_closed' } })).toBe(false);
    expect(isNotAtCommerce(new Error('boom'))).toBe(false);
  });
});
