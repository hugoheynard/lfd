import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CollectionBatchView, CollectionProcedureView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { collectionBatch } from '../../__tests__/collection-batch-fixture';
import { procedureBatch, procedureView } from '../../__tests__/collection-procedure-fixture';
import { ProcedureFileStep } from './procedure-file-step';

/**
 * L'onglet « Fichier » (Hugo, 2026-10-23) : sans limite de dépôt réglée, aucun
 * délai n'est proposé — un lien mène au réglage de l'entité ; les gestes du
 * lot sont dans une barre AU-DESSUS de sa carte, qui n'a plus les siens.
 */
async function render(
  view: CollectionProcedureView,
  batch: CollectionBatchView = collectionBatch(),
): Promise<ComponentFixture<ProcedureFileStep>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ProcedureFileStep], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ProcedureFileStep);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('batch', batch);
  fixture.componentRef.setInput('canWrite', true);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const host = (fixture: ComponentFixture<ProcedureFileStep>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('l’onglet « Fichier » de la procédure', () => {
  it('sans limite de dépôt : ne propose aucun délai, et mène au réglage de l’entité', async () => {
    const fixture = await render(
      procedureView({ followed: procedureBatch({ depositDeadline: null }) }),
    );

    const callout = host(fixture).querySelector('[data-deadline-unset]')?.textContent ?? '';
    expect(callout).toContain('La limite de dépôt de l’entité n’est pas réglée');
    expect(callout).not.toContain('jours ouvrés');
    expect(callout).not.toContain('13 h 45');
    const link = host(fixture).querySelector<HTMLAnchorElement>('[data-deadline-settings]');
    expect(link?.textContent).toContain('Régler la limite de dépôt');
    expect(link?.getAttribute('href')).toBe('/comptabilite/entites-juridiques/le1');
  });

  it('avec une limite réglée : pas d’encadré de réglage', async () => {
    const fixture = await render(procedureView());

    expect(host(fixture).querySelector('[data-deadline-unset]')).toBeNull();
  });

  it('la barre d’actions est au-dessus de la carte, qui n’a plus ses gestes', async () => {
    const fixture = await render(procedureView());

    const bar = host(fixture).querySelector('app-procedure-batch-actions');
    const card = host(fixture).querySelector('app-pending-batch');
    expect(bar).not.toBeNull();
    expect(card).not.toBeNull();
    expect(
      (bar?.compareDocumentPosition(card as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(card?.querySelector('button')).toBeNull();
    expect(host(fixture).textContent).not.toContain('Marquer déposé');
  });

  /** Plan `plan-lot-rejete-par-la-banque.md` § 7. */
  it('un lot déposé : la barre propose « La banque a rejeté ce fichier »', async () => {
    const fixture = await render(
      procedureView({
        followed: procedureBatch({ status: 'deposited' }),
        file: { ...procedureView().file, state: 'done', reason: 'deposited' },
      }),
      collectionBatch({ status: 'deposited' }),
    );

    expect(host(fixture).querySelector('[data-deposited]')).not.toBeNull();
    expect(host(fixture).querySelector('button[data-rejected-by-bank]')).not.toBeNull();
  });

  it('un lot rejeté : dit le motif, l’auteur et la date, et invite à préparer de nouveau', async () => {
    const fixture = await render(
      procedureView({
        followed: procedureBatch({
          status: 'rejected_by_bank',
          rejectedAt: '2026-11-03T09:00:00.000Z',
        }),
        file: { ...procedureView().file, state: 'to_do', reason: 'rejected_by_bank' },
      }),
      collectionBatch({
        status: 'rejected_by_bank',
        rejection: {
          at: '2026-11-03T09:00:00.000Z',
          reason: 'PSR1 : schéma invalide',
          byName: 'Claire Compta',
        },
      }),
    );

    const state = host(fixture).querySelector('[data-rejected-by-bank]')?.textContent ?? '';
    expect(state).toContain('La banque a rejeté ce fichier');
    expect(state).toContain('3 novembre 2026');
    expect(state).toContain('Claire Compta');
    expect(state).toContain('PSR1 : schéma invalide');
    expect(host(fixture).textContent).toContain('Préparer de nouveau');
  });
});
