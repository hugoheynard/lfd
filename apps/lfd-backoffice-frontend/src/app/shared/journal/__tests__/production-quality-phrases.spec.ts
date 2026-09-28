import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les phrases du contrôle qualité** (plan `plan-controle-qualite.md`, D9). */

function fact(type: FactInput['type'], payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType: 'production_quality_check',
    subjectId: '01JQC000000000000000000001',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

const LINE = { kind: 'line', sku: 'VIE-001', quantitySeen: 16 };
const ORDER = { kind: 'order', order: { id: 'ord_2', name: 'ORD-0002' } };

describe('un verdict rendu (production_quality.checked)', () => {
  it('dit la ligne, son compte et le verdict, sans rien laisser au détail', () => {
    const checked = fact('production_quality.checked', {
      subjectLabel: 'VIE-001',
      serviceDay: '2026-10-01',
      target: LINE,
      verdict: 'warning',
      photoCount: 2,
    });
    expect(sentence(checked)).toBe(
      'Colette Martin a contrôlé la ligne VIE-001 (16 au compte) : réserve, 2 photos',
    );
    expect(renderFact(checked).detail).toEqual([]);
  });

  it('dit la commande par sa référence, et tait les photos absentes', () => {
    expect(
      sentence(
        fact('production_quality.checked', {
          subjectLabel: 'ORD-0002',
          serviceDay: '2026-10-01',
          target: ORDER,
          verdict: 'ok',
          photoCount: 0,
        }),
      ),
    ).toBe('Colette Martin a contrôlé la commande ORD-0002 : OK');
  });
});

describe('la retenue au retrait', () => {
  it('un blocage de ligne nomme les commandes qu’il retient', () => {
    expect(
      sentence(
        fact('production_quality.hold_raised', {
          subjectLabel: 'VIE-001',
          serviceDay: '2026-10-01',
          target: LINE,
          heldOrders: [
            { id: 'ord_1', name: 'ORD-0001' },
            { id: 'ord_2', name: 'ORD-0002' },
          ],
        }),
      ),
    ).toBe(
      'Colette Martin a bloqué au retrait la ligne VIE-001 (16 au compte) : 2 commandes retenues (ORD-0001, ORD-0002)',
    );
  });

  it('une levée dit le nouveau verdict', () => {
    expect(
      sentence(
        fact('production_quality.hold_lifted', {
          subjectLabel: 'ORD-0002',
          serviceDay: '2026-10-01',
          target: ORDER,
          verdict: 'ok',
        }),
      ),
    ).toBe('Colette Martin a levé le blocage de la commande ORD-0002 — nouveau verdict : OK');
  });
});
