import { TestBed } from '@angular/core/testing';
import type { PlanVersionDiffView, PlanVersionMarkView, PlanVersionView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PlanVersionDiff } from './plan-version-diff';

/**
 * **La comparaison à l'écran** : l'effet par produit, l'orange des sorties à
 * vérifier, les changements avec leur version et leur auteur relu dans la
 * liste, `baselineUnknown`, et le diff vide. Instants comparés à aucune
 * horloge : absolus.
 */

const MARK: PlanVersionMarkView = {
  version: 2,
  cause: 'order_revised',
  recordedAt: '2026-11-27T18:10:00.000Z',
  recordedBy: { kind: 'staff', staffId: 'stf_marie', name: null },
  closedAt: '2026-11-27T16:00:00.000Z',
};

const VERSIONS: readonly PlanVersionView[] = [
  {
    version: 2,
    cause: 'order_revised',
    recordedAt: MARK.recordedAt,
    author: { kind: 'staff', staffId: 'stf_marie', name: 'Marie' },
    closedAt: MARK.closedAt,
    printRun: 1,
    shipmentCount: 3,
    paper: { version: 2, dossier: true, count: true },
  },
];

const EMPTY: PlanVersionDiffView = {
  from: { ...MARK, version: 1, cause: 'closed' },
  to: MARK,
  baselineUnknown: false,
  production: [],
  changes: [],
  resupplies: [],
  toCheck: [],
};

function render(diff: PlanVersionDiffView): HTMLElement {
  const fixture = TestBed.createComponent(PlanVersionDiff);
  fixture.componentRef.setInput('diff', diff);
  fixture.componentRef.setInput('versions', VERSIONS);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PlanVersionDiff', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('dit qu’il n’y a rien quand rien n’a changé', () => {
    const el = render(EMPTY);
    expect(el.textContent).toContain('Rien n’a changé');
    expect(el.querySelector('[data-to-check]')).toBeNull();
  });

  it('montre l’effet par produit, signé, en pièces et en grammes', () => {
    const el = render({
      ...EMPTY,
      production: [
        {
          sku: 'CRO',
          productName: 'Croissant',
          saleUnit: 'piece',
          before: 120,
          after: 135,
          delta: 15,
        },
        {
          sku: 'SAU',
          productName: 'Saumon',
          saleUnit: 'weight',
          before: 1250,
          after: 1000,
          delta: -250,
        },
      ],
    });
    const rows = [...el.querySelectorAll('[data-effect]')].map((row) =>
      [...row.querySelectorAll('th, td')].map((cell) => cell.textContent?.trim()),
    );
    expect(rows).toEqual([
      ['Croissant', '120', '135', '+15'],
      ['Saumon', '1,25 kg', '1 kg', '−250 g'],
    ]);
  });

  it('attribue chaque changement à sa version et à son auteur, relu dans la liste', () => {
    const el = render({
      ...EMPTY,
      changes: [
        {
          kind: 'revised',
          shipment: { orderId: 'o31', rank: 1, reference: 'ORD-0031', customerLabel: null },
          by: MARK,
          lines: [
            { sku: 'CRO', productName: 'Croissant', saleUnit: 'piece', before: 10, after: 15 },
          ],
        },
      ],
      resupplies: [
        { kind: 'launched', resupplyId: 'rs', siteLabel: 'Village', name: null, by: MARK },
      ],
    });
    const changes = [...el.querySelectorAll('[data-change]')].map((row) => row.textContent ?? '');
    expect(changes[0]).toContain('v2');
    expect(changes[0]).toContain('ORD-0031 révisée : Croissant 10 → 15 (Marie)');
    expect(changes[1]).toContain('réassort Village lancé (Marie)');
  });

  it('met en orange les sorties dont la raison est au commerce', () => {
    const el = render({
      ...EMPTY,
      toCheck: [
        {
          kind: 'left_reason_at_commerce',
          severity: 'to_check',
          shipment: { orderId: 'o9', rank: 1, reference: 'ORD-0009', customerLabel: null },
          by: MARK,
        },
      ],
    });
    const callout = el.querySelector('[data-to-check]');
    expect(callout?.getAttribute('variant')).toBe('warning');
    expect(callout?.textContent).toContain('ORD-0009 sortie du plan, raison au commerce');
  });

  it('dit qu’avant la première version l’historique n’existe pas', () => {
    const el = render({ ...EMPTY, baselineUnknown: true });
    expect(el.querySelector('[data-baseline-unknown]')?.textContent).toContain(
      'Avant la version 1, l’historique n’existe pas',
    );
  });
});
