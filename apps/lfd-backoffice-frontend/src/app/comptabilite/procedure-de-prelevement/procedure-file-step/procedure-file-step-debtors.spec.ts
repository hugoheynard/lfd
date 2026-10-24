import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CollectionProcedureDebtorGapView, CollectionProcedureView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { collectionBatch } from '../../__tests__/collection-batch-fixture';
import { procedureView } from '../../__tests__/collection-procedure-fixture';
import { ProcedureFileStep } from './procedure-file-step';

/**
 * L'onglet « Fichier » nomme les débiteurs DU LOT absents de CENET (P4
 * révisé, 2026-10-24) — un avertissement, jamais un verrou, et plus rien à
 * l'échelle de l'entité : ses onglets 1 et 2 le portent.
 */
function gap(
  over: Partial<CollectionProcedureDebtorGapView> = {},
): CollectionProcedureDebtorGapView {
  return {
    batchId: 'b1',
    scheme: 'B2B',
    debtorName: 'Café de l’Isère',
    mandateReference: 'RUM-1',
    account: 'known',
    mandate: 'not_exported',
    ...over,
  };
}

function withGaps(gaps: readonly CollectionProcedureDebtorGapView[]): CollectionProcedureView {
  const view = procedureView();
  return { ...view, file: { ...view.file, debtorsNotImported: gaps } };
}

async function render(view: CollectionProcedureView) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ProcedureFileStep], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ProcedureFileStep);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('batch', collectionBatch());
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

describe('l’onglet « Fichier » — les débiteurs du lot au référentiel de CENET', () => {
  it('nomme chaque débiteur, sa RUM et ce qui manque, avec la réponse 15', async () => {
    const { host } = await render(
      withGaps([
        gap(),
        gap({ debtorName: 'Le Refuge', mandateReference: 'RUM-2', account: 'not_exported' }),
      ]),
    );

    const callout = host.querySelector('[data-debtor-gaps]')?.textContent ?? '';
    expect(callout).toContain('2 débiteurs de ce lot n’ont pas');
    expect(callout).toContain('la banque ne le contrôle pas au dépôt (réponse 15)');
    const rows = [...host.querySelectorAll('[data-debtor-gap]')].map(
      (row) => row.textContent ?? '',
    );
    expect(rows[0]).toContain('Café de l’Isère');
    expect(rows[0]).toContain('RUM-1');
    expect(rows[0]).toContain('mandat jamais exporté');
    expect(rows[1]).toContain('compte jamais exporté, mandat jamais exporté');
  });

  it('le lien mène à l’onglet qui règle l’écart : Comptes si le compte manque, sinon Mandats', async () => {
    const { fixture, host } = await render(
      withGaps([
        gap({ mandateReference: 'RUM-A', account: 'in_export' }),
        gap({ mandateReference: 'RUM-M' }),
      ]),
    );
    const opened: string[] = [];
    fixture.componentInstance.openStep.subscribe((step) => opened.push(step));

    host.querySelector<HTMLButtonElement>('[data-rum="RUM-A"] [data-open-step]')?.click();
    host.querySelector<HTMLButtonElement>('[data-rum="RUM-M"] [data-open-step]')?.click();

    expect(opened).toEqual(['accounts', 'mandates']);
    expect(host.querySelector('[data-rum="RUM-M"]')?.textContent).toContain('Onglet 2 Mandats');
  });

  it('tout est importé : aucun avertissement, même si l’entité a des mandats à exporter', async () => {
    const view = withGaps([]);
    const { host } = await render({
      ...view,
      mandates: { ...view.mandates, toExportCount: 3, excludedCount: 1 },
      accounts: { ...view.accounts, excludedCount: 1 },
    });

    expect(host.querySelector('[data-debtor-gaps]')).toBeNull();
    expect(host.textContent).not.toContain('de l’entité ne sont pas importés');
    expect(host.textContent).not.toContain('sans BIC');
  });
});
