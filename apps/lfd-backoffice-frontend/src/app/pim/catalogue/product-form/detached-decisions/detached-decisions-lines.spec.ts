import type { SaleReferenceDecisionView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { decisionLine, decisionWindow, detachedDecisionLines } from './detached-decisions-lines';

/** L7 de `plan-pro-voit-les-declinaisons.md` : la ligne d’une décision restée sur l’ancienne référence. */

function view(over: Partial<SaleReferenceDecisionView> = {}): SaleReferenceDecisionView {
  return {
    kind: 'mercuriale',
    id: 'mer_1',
    label: 'Mercuriale Ancolie',
    companyId: 'cmp_1',
    companyName: 'Hôtel du Col',
    validFrom: '2026-11-01T10:00:00.000Z',
    validTo: '2026-11-30T10:00:00.000Z',
    paused: false,
    ...over,
  };
}

describe('decisionLine', () => {
  it('nomme la famille, la décision, la société et la fenêtre', () => {
    expect(decisionLine(view())).toBe(
      'Mercuriale « Mercuriale Ancolie » — Hôtel du Col — du 01/11/2026 au 30/11/2026',
    );
  });

  it('dit une décision ouverte à tous sans société, et la pause', () => {
    expect(
      decisionLine(view({ kind: 'price_rule', companyId: null, validTo: null, paused: true })),
    ).toBe('Règle de prix « Mercuriale Ancolie » — depuis le 01/11/2026 — en pause');
  });

  it('dit une société disparue, et un gabarit sans fenêtre', () => {
    expect(decisionWindow(view({ validFrom: null }))).toBe('');
    expect(decisionLine(view({ kind: 'price_template', companyName: null, validFrom: null }))).toBe(
      'Gabarit « Mercuriale Ancolie » — société introuvable',
    );
  });
});

describe('detachedDecisionLines', () => {
  it('une mercuriale se reporte, sauf si elle est déjà debout sur la nouvelle référence', () => {
    const rule = view({ kind: 'price_rule', id: 'rule_1' });
    const lines = detachedDecisionLines([view(), view({ id: 'mer_2' }), rule], [view()]);

    expect(lines.map(({ id, carriable, carried }) => ({ id, carriable, carried }))).toEqual([
      { id: 'mer_1', carriable: true, carried: true },
      { id: 'mer_2', carriable: true, carried: false },
      { id: 'rule_1', carriable: false, carried: false },
    ]);
  });
});
