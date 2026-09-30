import { TestBed } from '@angular/core/testing';
import type { PurchaseTableCellView, PurchaseTableView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { PurchaseTableCriterion } from '../purchase-table';
import { PurchaseTableGrid } from './purchase-table-grid';

function cell(
  total: number,
  percent: number,
  liters: number,
  cpl: number | null,
): PurchaseTableCellView {
  return {
    total,
    floorCount: total,
    levels: 1,
    usefulLiters: liters,
    vehiclePercent: percent,
    heightLimit: 'stack',
    equipmentCostCents: cpl === null ? null : total * 1250,
    totalCostCents: cpl === null ? null : 2_000_000 + total * 1250,
    costPerLiterCents: cpl,
  };
}

/** Deux véhicules × deux formats ; le serveur désigne des cases DIFFÉRENTES selon le critère. */
const VIEW: PurchaseTableView = {
  gapCm: 1,
  formats: [
    {
      source: 'candidate',
      id: 'f1',
      name: 'Caisse 50',
      innerVolumeLiters: 50,
      unitPriceCentsExclVat: 1250,
    },
    {
      source: 'bin_type',
      id: 'f2',
      name: 'Bac maison',
      innerVolumeLiters: 40,
      unitPriceCentsExclVat: null,
    },
  ],
  rows: [
    {
      source: 'candidate',
      id: 'v1',
      name: 'Trafic',
      vehicleVolumeLiters: 5525,
      priceCentsExclVat: 2_000_000,
      cells: [cell(20, 18, 1000, 2000), cell(30, 21, 1200, null)],
      best: { occupation: 1, volume: 1, costPerLiter: 0 },
    },
    {
      source: 'fleet',
      id: 'v2',
      name: 'Kangoo',
      vehicleVolumeLiters: 3000,
      priceCentsExclVat: null,
      cells: [cell(10, 16, 500, null), cell(0, 0, 0, null)],
      best: { occupation: 0, volume: 0, costPerLiter: null },
    },
  ],
  bestRowByCostPerLiter: 0,
};

async function render(
  criterion: PurchaseTableCriterion,
  showCostPerLiter: boolean,
): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [PurchaseTableGrid] });
  const fixture = TestBed.createComponent(PurchaseTableGrid);
  fixture.componentRef.setInput('view', VIEW);
  fixture.componentRef.setInput('criterion', criterion);
  fixture.componentRef.setInput('showCostPerLiter', showCostPerLiter);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** Le texte des cases de chaque ligne, dans l'ordre. */
function cells(host: HTMLElement): string[] {
  return [...host.querySelectorAll('[data-cell]')].map((el) =>
    (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

describe('PurchaseTableGrid', () => {
  it('dessine chaque case : bacs, occupation, volume, coûts HT ou « inconnu »', async () => {
    const host = await render('occupation', false);
    const texts = cells(host);
    expect(texts).toHaveLength(4);
    expect(texts[0]).toContain('20 bacs');
    expect(texts[0]).toContain('18 %');
    expect(texts[0]).toContain('1,00 m³');
    expect(texts[1]).toContain('Équipement inconnu');
    expect(host.textContent).toContain('prix inconnu');
  });

  it('met en avant la case que le serveur désigne pour le critère, sans reclasser', async () => {
    const byOccupation = await render('occupation', false);
    const best = [...byOccupation.querySelectorAll('[data-cell]')].map((el) =>
      el.hasAttribute('data-best'),
    );
    // Ligne 1 : case 2 ; ligne 2 : case 1.
    expect(best).toEqual([false, true, true, false]);

    const byCost = await render('costPerLiter', true);
    const bestByCost = [...byCost.querySelectorAll('[data-cell]')].map((el) =>
      el.hasAttribute('data-best'),
    );
    // `best.costPerLiter` : case 1 sur la ligne 1, AUCUNE sur la ligne 2 (null).
    expect(bestByCost).toEqual([true, false, false, false]);
  });

  it('masque le coût par litre et la meilleure ligne tant qu’on ne les demande pas', async () => {
    const hidden = await render('occupation', false);
    expect(hidden.querySelectorAll('[data-cost-per-liter]')).toHaveLength(0);
    expect(hidden.querySelector('[data-best-row]')).toBeNull();

    const shown = await render('occupation', true);
    expect(shown.querySelectorAll('[data-cost-per-liter]')).toHaveLength(4);
    expect(
      shown.querySelector('[data-cost-per-liter]')?.textContent?.replace(/\s/g, ' '),
    ).toContain('20,00 €/L HT');
    expect(shown.querySelectorAll('[data-best-row]')).toHaveLength(1);
  });
});
