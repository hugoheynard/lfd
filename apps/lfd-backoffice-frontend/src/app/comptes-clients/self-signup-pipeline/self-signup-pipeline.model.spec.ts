import { describe, expect, it } from 'vitest';

import type { AdminCompany } from '../admin-company';
import { inScope, pendingRows, pipelineFunnel } from './self-signup-pipeline.model';

const DAY_MS = 24 * 60 * 60 * 1000;
/** L'instant de référence : les âges sont relatifs à lui, jamais au calendrier. */
const NOW = new Date(Date.UTC(2030, 0, 31, 12));

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function company(id: string, overrides: Partial<AdminCompany> = {}): AdminCompany {
  return {
    id,
    reference: `C-${id}`,
    raisonSociale: '',
    enseigne: `Enseigne ${id}`,
    formeJuridique: '',
    siret: '',
    siren: '',
    vatNumber: '',
    status: 'pending',
    grantedTerms: [],
    requestedTerm: null,
    directDebitBlocked: false,
    primaryContact: {
      role: null,
      id: null,
      firstName: '',
      lastName: '',
      fonction: '',
      email: '',
      phone: '',
    },
    kbis: null,
    owner: null,
    hasOpenSupportRequest: false,
    parent: null,
    createdAt: daysBefore(1),
    declaredVia: 'self',
    piecesReached: [],
    activatedAt: null,
    warnings: [],
    ...overrides,
  };
}

describe('inScope', () => {
  it('« inscrits seuls » écarte le staff ET le canal inconnu', () => {
    expect(inScope(company('a'), 'self')).toBe(true);
    expect(inScope(company('b', { declaredVia: 'staff' }), 'self')).toBe(false);
    expect(inScope(company('c', { declaredVia: null }), 'self')).toBe(false);
  });

  it('« tous » garde tout le monde', () => {
    expect(inScope(company('c', { declaredVia: null }), 'all')).toBe(true);
  });
});

describe('pipelineFunnel', () => {
  it('compte déclarées, chaque pièce exigée, puis activées — la livraison n’est pas une marche', () => {
    const steps = pipelineFunnel([
      company('a', { piecesReached: ['vat', 'kbis'] }),
      company('b', { piecesReached: ['kbis'] }),
      company('c', {
        status: 'active',
        activatedAt: daysBefore(2),
        piecesReached: ['vat', 'kbis', 'billing', 'delivery'],
      }),
    ]);
    expect(steps.map((step) => [step.key, step.count])).toEqual([
      ['declared', 3],
      ['vat', 2],
      ['kbis', 3],
      ['billing', 1],
      ['activated', 1],
    ]);
  });
});

describe('pendingRows', () => {
  it('ne garde que les pending, le plus anciennement bloqué en tête', () => {
    const rows = pendingRows(
      [
        company('recent', { createdAt: daysBefore(2) }),
        company('old', { createdAt: daysBefore(20) }),
        company('done', { status: 'active', createdAt: daysBefore(40) }),
      ],
      NOW,
    );
    expect(rows.map((row) => [row.company.id, row.stalledDays])).toEqual([
      ['old', 20],
      ['recent', 2],
    ]);
  });

  it('marque chaque pièce faite ou manquante, dans l’ordre canonique', () => {
    const [row] = pendingRows([company('a', { piecesReached: ['billing', 'vat'] })], NOW);
    expect(row?.reached).toBe(2);
    expect(row?.pieces.map((mark) => [mark.label, mark.done])).toEqual([
      ['TVA', true],
      ['KBIS', false],
      ['Facturation', true],
    ]);
  });

  /**
   * Hugo, 2026-10-25 : « sur 3, la livraison à part ». L'activation n'exige
   * plus l'adresse de livraison : la compter ferait lire 3/4 à un dossier
   * activable.
   */
  it('compte sur les trois pièces exigées et montre la livraison à part', () => {
    const [row] = pendingRows(
      [company('a', { piecesReached: ['vat', 'kbis', 'billing', 'delivery'] })],
      NOW,
    );
    expect(row?.reached).toBe(3);
    expect(row?.pieces).toHaveLength(3);
    expect(row?.delivery).toEqual({ piece: 'delivery', label: 'Livraison', done: true });
  });
});
