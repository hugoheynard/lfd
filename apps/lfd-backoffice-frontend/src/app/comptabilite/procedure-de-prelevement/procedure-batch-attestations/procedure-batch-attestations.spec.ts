import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  BatchAttestationKindView,
  CollectionBatchAttestationsView,
  CollectionBatchStatusView,
  CreatedIdResponse,
} from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { CollectionBatchAttestationsService } from '../../collection-batch-attestations.service';
import type { WithdrawBatchAttestationPanelData } from '../withdraw-batch-attestation-panel/withdraw-batch-attestation-panel';
import { ProcedureBatchAttestations } from './procedure-batch-attestations';

/**
 * Les attestations d'un lot sous la barre de l'onglet 3 (P3, 2026-10-24) :
 * la signature n'apparaît qu'un lot déposé, chaque attestation dit quand et
 * par qui, et se retire par un panneau.
 */

class FakeAttestations {
  readonly attested: [string, BatchAttestationKindView][] = [];
  attest(batchId: string, kind: BatchAttestationKindView): Promise<CreatedIdResponse> {
    this.attested.push([batchId, kind]);
    return Promise.resolve({ id: 'att' });
  }
}

class FakePanels {
  readonly opened: (WithdrawBatchAttestationPanelData | undefined)[] = [];
  open(
    _component: unknown,
    options: { readonly data?: WithdrawBatchAttestationPanelData },
  ): { readonly closed: Promise<boolean> } {
    this.opened.push(options.data);
    return { closed: Promise.resolve(true) };
  }
}

const NONE: CollectionBatchAttestationsView = {
  audit_reviewed: null,
  remittance_signed: null,
  psr_read: null,
};

async function render(
  status: CollectionBatchStatusView,
  attestations: CollectionBatchAttestationsView = NONE,
  canWrite = true,
) {
  const api = new FakeAttestations();
  const panels = new FakePanels();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProcedureBatchAttestations],
    providers: [
      { provide: CollectionBatchAttestationsService, useValue: api },
      { provide: FoldPanelHostService, useValue: panels },
    ],
  });
  const fixture = TestBed.createComponent(ProcedureBatchAttestations);
  fixture.componentRef.setInput('batchId', 'b1');
  fixture.componentRef.setInput('status', status);
  fixture.componentRef.setInput('attestations', attestations);
  fixture.componentRef.setInput('canWrite', canWrite);
  let changed = 0;
  fixture.componentInstance.changed.subscribe(() => (changed += 1));
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, api, panels, changed: () => changed };
}

const host = (fixture: ComponentFixture<ProcedureBatchAttestations>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const kinds = (fixture: ComponentFixture<ProcedureBatchAttestations>): string[] =>
  [...host(fixture).querySelectorAll('[data-attestation]')].map(
    (row) => row.getAttribute('data-attestation') ?? '',
  );

describe('les attestations d’un lot (onglet 3)', () => {
  it('avant le dépôt : seul le contrôle CSV se coche — la signature attend le dépôt', async () => {
    const { fixture } = await render('constituted');

    expect(kinds(fixture)).toEqual(['audit_reviewed']);
    expect(host(fixture).textContent).toContain('J’ai relu le contrôle CSV');
  });

  it('déposé : les trois cases, dans l’ordre de la procédure', async () => {
    const { fixture } = await render('deposited');

    expect(kinds(fixture)).toEqual(['audit_reviewed', 'remittance_signed', 'psr_read']);
    expect(host(fixture).textContent).toContain('J’ai signé la remise sur CENET');
    expect(host(fixture).textContent).toContain('J’ai lu les comptes rendus PSR');
  });

  it('cocher pose l’attestation du lot, puis l’hôte relit', async () => {
    const { fixture, api, changed } = await render('deposited');

    host(fixture)
      .querySelector<HTMLButtonElement>('[data-attestation="remittance_signed"] [data-attest]')
      ?.click();
    await fixture.whenStable();

    expect(api.attested).toEqual([['b1', 'remittance_signed']]);
    expect(changed()).toBe(1);
  });

  it('attestée : « fait le … par … », et « Retirer » ouvre le panneau de sa sorte', async () => {
    const signed = { at: '2026-11-13T09:00:00.000Z', byName: 'Claire Compta' };
    const { fixture, panels, changed } = await render('deposited', {
      ...NONE,
      remittance_signed: signed,
    });

    const row = host(fixture).querySelector('[data-attestation="remittance_signed"]');
    expect(row?.querySelector('[data-attested]')?.textContent).toContain('par Claire Compta');
    expect(row?.querySelector('[data-attest]')).toBeNull();

    row?.querySelector<HTMLButtonElement>('[data-withdraw-attestation]')?.click();
    await fixture.whenStable();

    expect(panels.opened).toEqual([{ batchId: 'b1', kind: 'remittance_signed' }]);
    expect(changed()).toBe(1);
  });

  it('en lecture seule : ni case, ni retrait — l’état seul se lit', async () => {
    const signed = { at: '2026-11-13T09:00:00.000Z', byName: null };
    const { fixture } = await render('deposited', { ...NONE, remittance_signed: signed }, false);

    expect(host(fixture).querySelector('[data-attest]')).toBeNull();
    expect(host(fixture).querySelector('[data-withdraw-attestation]')).toBeNull();
    expect(host(fixture).textContent).toContain('pas encore noté');
  });

  it('un lot annulé n’atteste rien', async () => {
    const { fixture } = await render('cancelled');

    expect(host(fixture).querySelector('[data-attestations]')).toBeNull();
  });
});
