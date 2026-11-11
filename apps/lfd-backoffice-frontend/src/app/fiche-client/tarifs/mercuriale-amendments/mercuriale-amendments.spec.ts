import { TestBed } from '@angular/core/testing';
import type { PosedMercurialeView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { MercurialeAmendments } from './mercuriale-amendments';

/**
 * **Les avenants sous la grille d'une mercuriale** (`documentation/pricing/mercuriales/l-avenant-date.md`,
 * T6) : la liste, en lecture — les gestes d'écriture vivent dans la table.
 */

const MERCURIALE: PosedMercurialeView = {
  id: 'merc_1',
  label: 'Mercuriale 2027',
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: null,
  status: 'active',
  ruleCount: 1,
  skuCount: 1,
  createdBy: 'staff_1',
  createdByName: null,
  lines: [
    { sku: 'VIE-001-1', productName: 'Croissant', unitPriceMillicents: 90_000, minQuantity: 1 },
  ],
  amendments: [
    {
      id: 'amd_0',
      validFrom: '2026-02-01T00:00:00.000Z',
      validTo: null,
      reason: 'Ajout',
      openedSkus: ['VIE-002-1'],
      endedSkus: [],
      createdBy: 'staff_1',
      createdByName: 'Marie Curie',
    },
  ],
};

function mount(mercuriale: PosedMercurialeView = MERCURIALE): HTMLElement {
  const fixture = TestBed.createComponent(MercurialeAmendments);
  fixture.componentRef.setInput('mercuriale', mercuriale);
  fixture.componentRef.setInput('categories', []);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('<app-mercuriale-amendments>', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('liste les avenants passés, sans aucun geste', () => {
    const host = mount();
    expect(host.querySelectorAll('[data-amendments] li')).toHaveLength(1);
    expect(host.textContent).toContain('« Ajout » — Marie Curie');
    expect(host.querySelector('button')).toBeNull();
  });

  it('ne dit rien sans avenant', () => {
    const host = mount({ ...MERCURIALE, amendments: [] });
    expect(host.querySelector('[data-amendments]')).toBeNull();
  });
});
