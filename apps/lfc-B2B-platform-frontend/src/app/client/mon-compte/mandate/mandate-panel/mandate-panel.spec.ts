import { signal, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { CustomerMandateView } from '@lfd/contracts';
import { FoldFileDropzoneComponent } from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { ClientMandate } from '../../../client-mandate.service';
import { FR } from '../../../copy/fr';
import { MandatePanel, type MandatePanelData } from './mandate-panel';

const DRAFT: CustomerMandateView = {
  id: 'mdt_1',
  reference: 'LFD-MDT-0001',
  status: 'draft',
  hasProof: false,
  proofFileName: '',
  acceptedAt: null,
};

interface Wire {
  mandate: WritableSignal<CustomerMandateView | null>;
  generates: string[];
  proofs: { companyId: string; name: string }[];
  /** Ce que le serveur répond : `null` accepté, sinon son message. */
  answer: string | null;
  toasts: string[];
}

let wire: Wire;

function boot(
  mandate: CustomerMandateView | null,
  data: MandatePanelData = { companyId: 'cmp_1', generate: false },
): ComponentFixture<MandatePanel> {
  wire = { mandate: signal(mandate), generates: [], proofs: [], answer: null, toasts: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MandatePanel],
    providers: [
      {
        provide: ClientMandate,
        useValue: {
          mandate: wire.mandate,
          generate: (companyId: string): Promise<string | null> => {
            wire.generates.push(companyId);
            if (wire.answer === null) {
              wire.mandate.set(DRAFT);
            }
            return Promise.resolve(wire.answer);
          },
          attachProof: (companyId: string, file: File): Promise<string | null> => {
            wire.proofs.push({ companyId, name: file.name });
            if (wire.answer === null) {
              wire.mandate.set({ ...DRAFT, hasProof: true, proofFileName: file.name });
            }
            return Promise.resolve(wire.answer);
          },
          document: () => Promise.resolve(new Blob(['%PDF'])),
        },
      },
      {
        provide: NotifyService,
        useValue: { success: (m: string) => wire.toasts.push(m), error: () => undefined },
      },
    ],
  });
  const fixture = TestBed.createComponent(MandatePanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

async function settle(fixture: ComponentFixture<MandatePanel>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const el = (fixture: ComponentFixture<MandatePanel>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function drop(fixture: ComponentFixture<MandatePanel>, file: File): void {
  fixture.debugElement
    .query(By.directive(FoldFileDropzoneComponent))
    .triggerEventHandler('filesPicked', [file]);
}

const SCAN = new File(['%PDF-1.7'], 'mandat-signe.pdf', { type: 'application/pdf' });

describe('MandatePanel', () => {
  it('ouvert depuis « Générer mon mandat », génère aussitôt et montre le brouillon', async () => {
    const fixture = boot(null, { companyId: 'cmp_1', generate: true });
    await settle(fixture);

    expect(wire.generates).toEqual(['cmp_1']);
    expect(el(fixture).textContent).toContain('RUM · LFD-MDT-0001');
    expect(el(fixture).textContent).toContain(FR.account.mandateAwaitingBody);
  });

  it('sans mandat et sans génération demandée, explique et propose de générer', async () => {
    const fixture = boot(null);
    expect(wire.generates).toEqual([]);
    expect(el(fixture).textContent).toContain(FR.account.mandateNoneBody);

    el(fixture).querySelector<HTMLButtonElement>('button.generate')?.click();
    await settle(fixture);
    expect(wire.generates).toEqual(['cmp_1']);
  });

  it('un refus de génération s’affiche tel quel, et le panneau reste là', async () => {
    const fixture = boot(null);
    wire.answer = 'Enregistrez d’abord votre RIB.';
    el(fixture).querySelector<HTMLButtonElement>('button.generate')?.click();
    await settle(fixture);

    const alert = el(fixture).querySelector('fold-callout[variant="alert"]');
    expect(alert?.textContent).toContain(FR.account.mandateGenerateFailed);
    expect(alert?.textContent).toContain('Enregistrez d’abord votre RIB.');
    expect(el(fixture).querySelector('button.generate')).not.toBeNull();
  });

  it('brouillon sans scan : consigne, voir et télécharger, dépôt, signature électronique inerte', () => {
    const fixture = boot(DRAFT);
    const host = el(fixture);

    expect(host.textContent).toContain(FR.account.mandateAwaiting);
    expect(host.textContent).toContain(FR.account.mandateAwaitingBody);
    expect(host.querySelector('button.view')?.textContent).toContain(FR.account.mandateView);
    expect(host.querySelector('button.download')?.textContent).toContain(
      FR.account.mandateDownload,
    );
    expect(host.querySelector('fold-file-dropzone')?.textContent).toContain(FR.account.mandateDrop);

    const esign = host.querySelector<HTMLButtonElement>('button.esign-button');
    expect(esign?.textContent).toContain(FR.account.mandateEsign);
    expect(esign?.disabled).toBe(true);
    expect(host.querySelector('.esign fold-badge')?.textContent).toContain(
      FR.account.mandateEsignSoon,
    );
  });

  it('déposer le scan passe à « en vérification », le dit, et reste ouvert', async () => {
    const fixture = boot(DRAFT);
    drop(fixture, SCAN);
    await settle(fixture);

    expect(wire.proofs).toEqual([{ companyId: 'cmp_1', name: 'mandat-signe.pdf' }]);
    expect(wire.toasts).toEqual([FR.account.mandateUploadedToast]);
    expect(el(fixture).textContent).toContain(FR.account.mandateInReview);
    expect(el(fixture).textContent).toContain('Fichier déposé : mandat-signe.pdf');
  });

  it('un dépôt refusé s’affiche tel quel, sans toast de succès', async () => {
    const fixture = boot(DRAFT);
    wire.answer = 'Le fichier doit être un PDF ou une image.';
    drop(fixture, SCAN);
    await settle(fixture);

    const alert = el(fixture).querySelector('fold-callout[variant="alert"]');
    expect(alert?.textContent).toContain(FR.account.mandateUploadFailed);
    expect(alert?.textContent).toContain('Le fichier doit être un PDF ou une image.');
    expect(wire.toasts).toEqual([]);
    expect(el(fixture).textContent).toContain(FR.account.mandateAwaiting);
  });

  it('brouillon avec scan : le fichier, un dépôt qui remplace, plus de signature électronique', () => {
    const fixture = boot({ ...DRAFT, hasProof: true, proofFileName: 'mandat-signe.pdf' });
    const host = el(fixture);

    expect(host.textContent).toContain(FR.account.mandateInReviewBody);
    expect(host.textContent).toContain('Fichier déposé : mandat-signe.pdf');
    expect(host.querySelector('fold-file-dropzone')?.textContent).toContain(
      FR.account.mandateDropReplace,
    );
    expect(host.querySelector('button.esign-button')).toBeNull();
  });

  it('actif : la RUM et la date du papier, ni PDF, ni dépôt, ni génération', () => {
    const fixture = boot({ ...DRAFT, status: 'active', hasProof: true, acceptedAt: '2026-09-10' });
    const host = el(fixture);

    expect(host.textContent).toContain(FR.account.mandateActive);
    expect(host.textContent).toContain(FR.account.mandateActiveBody);
    expect(host.textContent).toContain('Signé le 10/09/2026');
    expect(host.querySelector('fold-file-dropzone')).toBeNull();
    expect(host.querySelector('button.view')).toBeNull();
    expect(host.querySelector('button.generate')).toBeNull();
  });
});
