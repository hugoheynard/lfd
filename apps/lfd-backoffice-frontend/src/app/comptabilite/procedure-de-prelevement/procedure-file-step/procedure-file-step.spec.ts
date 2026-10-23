import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CollectionProcedureView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { collectionBatch } from '../../__tests__/collection-batch-fixture';
import { procedureBatch, procedureView } from '../../__tests__/collection-procedure-fixture';
import { ProcedureFileStep } from './procedure-file-step';

/**
 * L'onglet « Fichier » (Hugo, 2026-10-23) : sans limite de dépôt réglée, aucun
 * délai n'est proposé — un lien mène au réglage de l'entité ; les gestes du
 * lot sont dans une barre AU-DESSUS de sa carte, qui n'a plus les siens.
 */
async function render(view: CollectionProcedureView): Promise<ComponentFixture<ProcedureFileStep>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ProcedureFileStep], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ProcedureFileStep);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('batch', collectionBatch());
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
});
