import type { SaleReferenceDecisionView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  decisionLine,
  decisionWindow,
  detachedDecisionLines,
  linesToCarryAll,
} from './detached-decisions-lines';

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
    origin: null,
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
  const OLD = 'CHO-000-2';

  it('une mercuriale se reporte, sauf si elle est déjà debout sur la nouvelle référence', () => {
    const lines = detachedDecisionLines([view(), view({ id: 'mer_2' })], [view()], OLD);

    expect(lines.map(({ id, carriable, carried }) => ({ id, carriable, carried }))).toEqual([
      { id: 'mer_1', carriable: true, carried: true },
      { id: 'mer_2', carriable: true, carried: false },
    ]);
  });

  it('une règle est reportée quand la nouvelle porte une règle venue d’elle', () => {
    const rule = view({ kind: 'price_rule', id: 'rule_1' });
    const carriedRule = view({
      kind: 'price_rule',
      id: 'rule_9',
      origin: { fromSku: OLD, fromDecisionId: 'rule_1' },
    });

    expect(detachedDecisionLines([rule], [], OLD)[0]).toMatchObject({
      kind: 'price_rule',
      carriable: true,
      carried: false,
    });
    expect(detachedDecisionLines([rule], [carriedRule], OLD)[0]?.carried).toBe(true);
  });

  it('un plancher re-versionné reste reporté : même famille, même origine, même clientèle', () => {
    const floor = view({
      kind: 'price_floor',
      id: 'flr_2',
      label: 'Plancher pro',
      companyId: null,
    });
    const carried = view({
      kind: 'price_floor',
      id: 'flr_9',
      label: 'Plancher pro',
      companyId: null,
      origin: { fromSku: OLD, fromDecisionId: 'flr_1' },
    });

    expect(detachedDecisionLines([floor], [carried], OLD)[0]?.carried).toBe(true);
    expect(
      detachedDecisionLines([floor], [{ ...carried, label: 'Plancher public' }], OLD)[0]?.carried,
    ).toBe(false);
  });
});

describe('linesToCarryAll', () => {
  it('ne garde que ce qui reste à reporter ET que la personne peut poser', () => {
    const lines = detachedDecisionLines(
      [
        view({ kind: 'price_rule', id: 'rule_1' }),
        view({ kind: 'price_floor', id: 'flr_1' }),
        view({ id: 'mer_1' }),
      ],
      [view({ id: 'mer_1' })],
      'CHO-000-2',
    );

    expect(linesToCarryAll(lines, (kind) => kind !== 'price_floor').map((line) => line.id)).toEqual(
      ['rule_1'],
    );
  });
});
