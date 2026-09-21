import { signal, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { CustomerMandateView, SepaScheme } from '@lfd/contracts';
import { FoldFileDropzoneComponent, FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { ClientMandate } from '../../../client-mandate.service';
import { FR } from '../../../copy/fr';
import { matchMediaAt, openedPanel } from '../../account.fixture';
import { MandateProofDialog } from './mandate-proof-dialog';

const DRAFT: CustomerMandateView = {
  id: 'mdt_1',
  reference: 'LFD-MDT-0001',
  status: 'draft',
  scheme: 'CORE',
  hasProof: false,
  proofFileName: '',
  acceptedAt: null,
};

const SCAN = new File(['%PDF-1.7'], 'mandat-signe.pdf', { type: 'application/pdf' });

interface Wire {
  mandate: WritableSignal<CustomerMandateView | null>;
  proofs: { companyId: string; name: string }[];
  /** Ce que le serveur répond : `null` accepté, sinon son message. */
  answer: string | null;
  closes: unknown[];
  toasts: string[];
}

let wire: Wire;

function boot(
  mandate: CustomerMandateView,
  issuerScheme: SepaScheme | null = null,
): ComponentFixture<MandateProofDialog> {
  wire = { mandate: signal(mandate), proofs: [], answer: null, closes: [], toasts: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MandateProofDialog],
    providers: [
      {
        provide: ClientMandate,
        useValue: {
          mandate: wire.mandate,
          issuerScheme: signal(issuerScheme),
          // Le vrai `attachProof` relit le mandat après le 204 (spec du service) :
          // le doublé le rejoue, pour que la vue relue soit celle qu'on observe.
          attachProof: (companyId: string, file: File): Promise<string | null> => {
            wire.proofs.push({ companyId, name: file.name });
            if (wire.answer === null) {
              wire.mandate.set({ ...mandate, hasProof: true, proofFileName: file.name });
            }
            return Promise.resolve(wire.answer);
          },
        },
      },
      {
        provide: NotifyService,
        useValue: { success: (m: string) => wire.toasts.push(m), error: () => undefined },
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(MandateProofDialog);
  fixture.componentRef.setInput('data', { companyId: 'cmp_1' });
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<MandateProofDialog>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

async function drop(fixture: ComponentFixture<MandateProofDialog>, file: File): Promise<void> {
  fixture.debugElement
    .query(By.directive(FoldFileDropzoneComponent))
    .triggerEventHandler('filesPicked', [file]);
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('MandateProofDialog', () => {
  it('brouillon sans scan : la consigne « daté et signé », la RUM, le dépôt, la signature électronique inerte', () => {
    const el = host(boot(DRAFT));

    expect(el.querySelector('fold-panel-header')?.textContent).toContain(FR.account.mandateSend);
    expect(el.textContent).toContain('RUM · LFD-MDT-0001');
    expect(el.textContent).toContain(FR.account.mandateAwaitingBody.CORE);
    expect(el.querySelector('fold-file-dropzone')?.textContent).toContain(FR.account.mandateDrop);

    const esign = el.querySelector<HTMLButtonElement>('button.esign-button');
    expect(esign?.textContent).toContain(FR.account.mandateEsign);
    expect(esign?.disabled).toBe(true);
  });

  /** Le schéma FIGÉ sur le brouillon choisit la consigne, pas celui de l'émetteur. */
  it('brouillon interentreprises sous un émetteur CORE : la consigne du papier signé', () => {
    const el = host(boot({ ...DRAFT, scheme: 'B2B' }, 'CORE'));

    expect(el.textContent).toContain(FR.account.mandateAwaitingBody.B2B);
  });

  it('un scan déjà déposé : son nom, un dépôt qui remplace, plus de signature électronique', () => {
    const el = host(boot({ ...DRAFT, hasProof: true, proofFileName: 'ancien-scan.pdf' }));

    expect(el.textContent).toContain('Fichier déposé : ancien-scan.pdf');
    expect(el.querySelector('fold-file-dropzone')?.textContent).toContain(
      FR.account.mandateDropReplace,
    );
    expect(el.querySelector('button.esign-button')).toBeNull();
  });

  it('un dépôt réussi relit le mandat, le dit, et ferme le dialogue avec `true`', async () => {
    const fixture = boot(DRAFT);
    await drop(fixture, SCAN);

    expect(wire.proofs).toEqual([{ companyId: 'cmp_1', name: 'mandat-signe.pdf' }]);
    expect(wire.mandate()?.hasProof).toBe(true);
    expect(wire.toasts).toEqual([FR.account.mandateUploadedToast]);
    expect(wire.closes).toEqual([true]);
  });

  it('un dépôt refusé s’affiche tel quel, sans toast, et le dialogue reste ouvert', async () => {
    const fixture = boot(DRAFT);
    wire.answer = 'Le fichier doit être un PDF ou une image.';
    await drop(fixture, SCAN);

    const alert = host(fixture).querySelector('fold-callout[variant="alert"]');
    expect(alert?.textContent).toContain(FR.account.mandateUploadFailed);
    expect(alert?.textContent).toContain('Le fichier doit être un PDF ou une image.');
    expect(wire.toasts).toEqual([]);
    expect(wire.closes).toEqual([]);
    expect(host(fixture).querySelector('fold-file-dropzone')).not.toBeNull();
  });

  describe('open()', () => {
    afterEach(() => {
      TestBed.inject(FoldPanelHostService).dismissAll();
      vi.unstubAllGlobals();
    });

    /** Une saisie : feuille du bas sous le pli, dialogue centré au-delà (règle « Saisir »). */
    it('monte du bas sous le pli, et se centre au-delà', () => {
      boot(DRAFT);
      const panels = TestBed.inject(FoldPanelHostService);

      vi.stubGlobal('matchMedia', matchMediaAt(true));
      MandateProofDialog.open(panels, 'cmp_1');
      expect(openedPanel()?.component).toBe(MandateProofDialog);
      expect(openedPanel()?.side).toBe('bottom');
      expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1' });

      panels.dismissAll();
      vi.stubGlobal('matchMedia', matchMediaAt(false));
      MandateProofDialog.open(panels, 'cmp_1');
      expect(openedPanel()?.side).toBe('center');
    });
  });
});
