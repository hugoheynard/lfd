import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CollectionProcedureView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { collectionBatch } from '../../__tests__/collection-batch-fixture';
import { procedureBatch, procedureView } from '../../__tests__/collection-procedure-fixture';
import { ProcedureFileStep } from './procedure-file-step';

/**
 * L'onglet « Fichier » et les attestations du lot (P3, 2026-10-24) : déposé,
 * il attend « J'ai signé la remise sur CENET » ; signé, il est fait. Les cases
 * du lot sont sous sa barre d'actions.
 */
async function render(
  view: CollectionProcedureView,
  status: 'constituted' | 'deposited' = 'deposited',
): Promise<ComponentFixture<ProcedureFileStep>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ProcedureFileStep], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ProcedureFileStep);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('batch', collectionBatch({ id: 'b1', status }));
  fixture.componentRef.setInput('canWrite', true);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const host = (fixture: ComponentFixture<ProcedureFileStep>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function depositedView(reason: 'signature_to_attest' | 'deposited'): CollectionProcedureView {
  const signed = { at: '2026-11-13T09:00:00.000Z', byName: 'Claire Compta' };
  const lot = procedureBatch({
    status: 'deposited',
    attestations: {
      audit_reviewed: null,
      remittance_signed: reason === 'deposited' ? signed : null,
      psr_read: null,
    },
  });
  const base = procedureView();
  return procedureView({
    followed: lot,
    procedureBatches: [lot],
    file: { ...base.file, state: reason === 'deposited' ? 'done' : 'waiting', reason },
  });
}

describe('l’onglet « Fichier » — les attestations du lot', () => {
  it('déposé, signature pas cochée : l’invite « Signer la remise sur CENET, puis cocher »', async () => {
    const fixture = await render(depositedView('signature_to_attest'));

    expect(host(fixture).querySelector('[data-signature-to-attest]')?.textContent).toContain(
      'Signer la remise sur CENET, puis cocher',
    );
    expect(host(fixture).querySelector('[data-deposited]')).toBeNull();
    expect(
      host(fixture).querySelector('[data-attestation="remittance_signed"] [data-attest]'),
    ).not.toBeNull();
  });

  it('signée : l’onglet le dit, et la case dit qui l’a cochée', async () => {
    const fixture = await render(depositedView('deposited'));

    expect(host(fixture).querySelector('[data-deposited]')).not.toBeNull();
    expect(
      host(fixture).querySelector('[data-attestation="remittance_signed"] [data-attested]')
        ?.textContent,
    ).toContain('Claire Compta');
  });

  it('les cases sont sous la barre d’actions du lot', async () => {
    const fixture = await render(depositedView('signature_to_attest'));

    const order = [
      ...host(fixture).querySelectorAll(
        'app-procedure-batch-actions, app-procedure-batch-attestations',
      ),
    ].map((element) => element.tagName.toLowerCase());
    expect(order).toEqual(['app-procedure-batch-actions', 'app-procedure-batch-attestations']);
  });

  it('à déposer : le contrôle CSV relu se coche déjà', async () => {
    const fixture = await render(procedureView(), 'constituted');

    expect(host(fixture).querySelector('[data-attestation="audit_reviewed"]')).not.toBeNull();
    expect(host(fixture).querySelector('[data-attestation="remittance_signed"]')).toBeNull();
  });
});
