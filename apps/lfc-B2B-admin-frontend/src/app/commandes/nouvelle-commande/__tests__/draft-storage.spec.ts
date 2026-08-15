import { beforeEach, describe, expect, it } from 'vitest';

import type { CartLine } from '../cart.store';
import { clearDraft, loadDraft, saveDraft } from '../draft-storage';
import { DraftStore } from '../draft.store';

const LINES: readonly CartLine[] = [
  { sku: 'VIE-001', name: 'Croissant', unitPriceCents: 110, quantity: 40 },
];

function snapshotWith(note: string): ReturnType<DraftStore['snapshot']> {
  const draft = new DraftStore();
  draft.note.set(note);
  draft.requestedDate.set('2026-08-20');
  draft.settlement.set('account');
  return draft.snapshot();
}

describe('le brouillon mis de côté', () => {
  beforeEach(() => localStorage.clear());

  it('se relit tel qu’il a été enregistré', () => {
    saveDraft('cmp_1', { lines: LINES, draft: snapshotWith('sans sucre') });

    const stored = loadDraft('cmp_1');

    expect(stored?.lines).toEqual(LINES);
    expect(stored?.draft.note).toBe('sans sucre');
    expect(stored?.draft.settlement).toBe('account');
  });

  it('garde un brouillon par société', () => {
    // Deux comptes en cours de saisie ne doivent pas s'écraser : c'est toute la
    // raison d'une clé par société.
    saveDraft('cmp_1', { lines: LINES, draft: snapshotWith('premier') });
    saveDraft('cmp_2', { lines: [], draft: snapshotWith('second') });

    expect(loadDraft('cmp_1')?.draft.note).toBe('premier');
    expect(loadDraft('cmp_2')?.draft.note).toBe('second');
  });

  it('ignore un contenu qui n’a plus la forme attendue', () => {
    // Un brouillon d'une version précédente vaut mieux ignoré que restauré à
    // moitié — un panier à demi repris est pire qu'un panier vide.
    localStorage.setItem('lfc.admin.order-draft.cmp_1', '{"lines":"???"}');

    expect(loadDraft('cmp_1')).toBeNull();
  });

  it('rend null après effacement', () => {
    saveDraft('cmp_1', { lines: LINES, draft: snapshotWith('') });

    clearDraft('cmp_1');

    expect(loadDraft('cmp_1')).toBeNull();
  });

  it('repose le brouillon dans un store neuf', () => {
    saveDraft('cmp_1', { lines: LINES, draft: snapshotWith('à 6 h') });
    const stored = loadDraft('cmp_1');
    if (stored === null) {
      throw new Error('Le brouillon vient d’être enregistré : il devrait se relire.');
    }
    const draft = new DraftStore();

    draft.restore(stored.draft);

    expect(draft.note()).toBe('à 6 h');
    expect(draft.requestedDate()).toBe('2026-08-20');
  });
});
