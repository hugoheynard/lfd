import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CollectionProcedureBankLimitsView, CollectionProcedureView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { collectionBatch } from '../../__tests__/collection-batch-fixture';
import { procedureView } from '../../__tests__/collection-procedure-fixture';
import { ProcedureFileStep } from './procedure-file-step';

/**
 * L'onglet « Fichier » avertit des plafonds de la banque dépassés par le lot
 * (plan `plan-plafonds-de-la-banque.md`, PL2) — un callout par constat, et
 * jamais un verrou (Q1, Hugo, 2026-10-24).
 */
function limits(
  over: Partial<CollectionProcedureBankLimitsView> = {},
): CollectionProcedureBankLimitsView {
  return {
    batchId: 'b1',
    scheme: 'B2B',
    perDebit: [],
    perRemittance: null,
    monthly: null,
    ...over,
  };
}

function withLimits(bankLimits: CollectionProcedureBankLimitsView | null): CollectionProcedureView {
  const view = procedureView();
  return { ...view, file: { ...view.file, bankLimits } };
}

async function render(view: CollectionProcedureView) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ProcedureFileStep], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ProcedureFileStep);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('batch', collectionBatch());
  fixture.componentRef.setInput('canWrite', true);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const text = (host: HTMLElement, selector: string) =>
  (host.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ');

describe('l’onglet « Fichier » — les plafonds de la banque', () => {
  it('nomme chaque débiteur au-dessus du plafond unitaire, avec son montant et le plafond', async () => {
    const host = await render(
      withLimits(
        limits({
          perDebit: [
            { rank: 1, debtorName: 'Café de l’Isère', amountCents: 125_000, limitCents: 100_000 },
            { rank: 3, debtorName: 'Le Refuge', amountCents: 110_050, limitCents: 100_000 },
          ],
        }),
      ),
    );

    expect(text(host, '[data-limit-per-debit]')).toContain('2 débiteurs de ce lot dépassent');
    const rows = [...host.querySelectorAll('[data-debit-over-limit]')].map((row) =>
      (row.textContent ?? '').replace(/\s+/g, ' '),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Café de l’Isère');
    expect(rows[0]).toMatch(/1\s250,00\s€ pour un plafond de 1\s000,00\s€/);
    expect(rows[1]).toContain('Le Refuge');
    expect(host.querySelector('[data-limit-per-remittance]')).toBeNull();
    expect(host.querySelector('[data-limit-monthly]')).toBeNull();
  });

  it('dit le total du lot et le plafond par remise', async () => {
    const host = await render(
      withLimits(limits({ perRemittance: { totalCents: 520_000, limitCents: 500_000 } })),
    );

    const sentence = text(host, '[data-limit-per-remittance]');
    expect(sentence).toMatch(/Le total de ce lot, 5\s200,00\s€/);
    expect(sentence).toMatch(/plafond par remise de la banque \(5\s000,00\s€\)/);
  });

  it('dit le cumul du mois en toutes lettres, le nombre de lots, et que le mois est celui de l’échéance', async () => {
    const host = await render(
      withLimits(
        limits({
          monthly: {
            month: '2026-11',
            totalCents: 2_100_000,
            limitCents: 2_000_000,
            batchCount: 3,
          },
        }),
      ),
    );

    const sentence = text(host, '[data-limit-monthly]');
    expect(sentence).toContain('novembre 2026');
    expect(sentence).toContain('3 lots');
    expect(sentence).toMatch(/21\s000,00\s€/);
    expect(sentence).toMatch(/20\s000,00\s€/);
    expect(sentence).toContain('celui de l’échéance');
  });

  it('rien quand les plafonds ne sont pas lus, ni quand aucun constat n’est présent', async () => {
    for (const bankLimits of [null, limits()]) {
      const host = await render(withLimits(bankLimits));
      expect(host.querySelector('[data-limit-per-debit]')).toBeNull();
      expect(host.querySelector('[data-limit-per-remittance]')).toBeNull();
      expect(host.querySelector('[data-limit-monthly]')).toBeNull();
    }
  });

  it('ne ferme pas le dépôt : le bouton est dans le même état avec ou sans dépassement', async () => {
    const quiet = await render(withLimits(null));
    const loud = await render(
      withLimits(
        limits({
          perRemittance: { totalCents: 520_000, limitCents: 500_000 },
          monthly: {
            month: '2026-11',
            totalCents: 2_100_000,
            limitCents: 2_000_000,
            batchCount: 1,
          },
        }),
      ),
    );

    const deposit = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('[data-deposit]');
    expect(deposit(loud)).not.toBeNull();
    expect(deposit(loud)?.disabled).toBe(deposit(quiet)?.disabled);
    expect(text(loud, '[data-limit-monthly]')).toContain('1 lot dont celui-ci');
  });
});
