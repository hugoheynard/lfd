import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { CollectionBatchLineView, CollectionBatchView } from '@lfd/contracts';

import { BatchLines, toRow } from './batch-lines';

/**
 * Ce que ces cas tiennent (plan `plan-le-prelevement-suit-la-facture.md`, F4) :
 * l'écart est signé, en euros, total facturé − Σ bons ; une ligne d'avant
 * l'arrêté dit qu'elle l'est, jamais zéro, et n'ouvre aucun dossier.
 */

function line(over: Partial<CollectionBatchLineView> = {}): CollectionBatchLineView {
  return {
    rank: 1,
    debtorName: 'Boulangerie du Port',
    amountCents: 10_018,
    ordersTotalCents: 10_019,
    billingStatementId: 'st_1',
    ...over,
  };
}

function batchOf(lines: readonly CollectionBatchLineView[]): CollectionBatchView {
  return {
    id: 'b1',
    scheme: 'B2B',
    cycleStartsAt: '2026-08-31T22:00:00.000Z',
    cycleClosesAt: '2026-09-30T22:00:00.000Z',
    status: 'constituted',
    constitutedAt: '2026-10-02T09:00:00.000Z',
    depositedAt: null,
    cancelledAt: null,
    lineCount: lines.length,
    orderCount: 2,
    totalCents: 10_018,
    unmandatedCompanies: [],
    depositable: true,
    requestedCollectionDay: '2026-10-15',
    depositDeadline: null,
    lines,
  };
}

async function render(lines: readonly CollectionBatchLineView[]): Promise<HTMLElement> {
  TestBed.configureTestingModule({ imports: [BatchLines], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(BatchLines);
  fixture.componentRef.setInput('batch', batchOf(lines));
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('toRow', () => {
  it('écrit l’écart signé : facturé − Σ bons', () => {
    expect(toRow(line()).gap).toMatch(/^−0,01\s€$/u);
    expect(toRow(line({ amountCents: 10_021 })).gap).toMatch(/^\+0,02\s€$/u);
    expect(toRow(line({ amountCents: 10_019 })).gap).toMatch(/^0,00\s€$/u);
  });

  it('une ligne d’avant l’arrêté n’a ni Σ bons, ni écart, ni dossier — pas un zéro', () => {
    const row = toRow(line({ ordersTotalCents: null, billingStatementId: null }));

    expect(row).toMatchObject({ orders: null, gap: null, statementId: null });
    expect(row.billed).toMatch(/^100,18\s€$/u);
  });
});

describe('BatchLines', () => {
  it('rend Σ bons, total facturé, écart, et le lien vers le dossier de la ligne', async () => {
    const host = await render([line()]);

    expect(host.textContent).toMatch(/100,19\s€/u);
    expect(host.textContent).toMatch(/100,18\s€/u);
    expect(host.querySelector('[data-line-gap]')?.textContent).toMatch(/−0,01\s€/u);
    const link = host.querySelector<HTMLAnchorElement>('a[href]');
    expect(link?.getAttribute('href')).toBe('/comptabilite/arretes-de-facturation/st_1');
  });

  it('dit « lot d’avant l’arrêté de facturation » au lieu d’un zéro', async () => {
    const host = await render([line({ ordersTotalCents: null, billingStatementId: null })]);

    expect(host.querySelector('[data-before-statement]')?.textContent).toContain(
      'Lot d’avant l’arrêté de facturation',
    );
    expect(host.querySelector('[data-line-gap]')).toBeNull();
    expect(host.querySelector('a[href]')).toBeNull();
  });
});
