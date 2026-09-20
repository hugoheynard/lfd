import { signal, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CustomerMandateView, MintBlocker, SepaScheme } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientMandate } from '../../../client-mandate.service';
import { FR } from '../../../copy/fr';
import { matchMediaAt, openedPanel } from '../../account.fixture';
import { MandateProofDialog } from '../mandate-proof-dialog/mandate-proof-dialog';
import { MandatePanel, type MandatePanelData } from './mandate-panel';

const DRAFT: CustomerMandateView = {
  id: 'mdt_1',
  reference: 'LFD-MDT-0001',
  status: 'draft',
  scheme: 'CORE',
  hasProof: false,
  proofFileName: '',
  acceptedAt: null,
};

interface Wire {
  mandate: WritableSignal<CustomerMandateView | null>;
  issuerScheme: WritableSignal<SepaScheme | null>;
  mintBlockers: WritableSignal<readonly MintBlocker[]>;
  refreshes: string[];
  generates: string[];
  /** Ce que le serveur répond : `null` accepté, sinon son message. */
  answer: string | null;
}

let wire: Wire;

function boot(
  mandate: CustomerMandateView | null,
  data: MandatePanelData = { companyId: 'cmp_1', generate: false },
  issuerScheme: SepaScheme | null = null,
  mintBlockers: readonly MintBlocker[] = [],
): ComponentFixture<MandatePanel> {
  wire = {
    mandate: signal(mandate),
    issuerScheme: signal(issuerScheme),
    mintBlockers: signal(mintBlockers),
    refreshes: [],
    generates: [],
    answer: null,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MandatePanel],
    providers: [
      {
        provide: ClientMandate,
        useValue: {
          mandate: wire.mandate,
          issuerScheme: wire.issuerScheme,
          mintBlockers: wire.mintBlockers,
          refresh: (companyId: string): Promise<void> => {
            wire.refreshes.push(companyId);
            return Promise.resolve();
          },
          generate: (companyId: string): Promise<string | null> => {
            wire.generates.push(companyId);
            if (wire.answer === null) {
              wire.mandate.set(DRAFT);
            }
            return Promise.resolve(wire.answer);
          },
          document: () => Promise.resolve(new Blob(['%PDF'])),
        },
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

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('MandatePanel', () => {
  describe('le texte suit le schéma', () => {
    it('sans mandat, sous un émetteur interentreprises : le texte interentreprises', () => {
      const fixture = boot(null, { companyId: 'cmp_1', generate: false }, 'B2B');

      expect(el(fixture).textContent).toContain(FR.account.mandateNoneBody.B2B);
    });

    it('sans mandat, sous un émetteur CORE : rien sur « interentreprises »', () => {
      const fixture = boot(null, { companyId: 'cmp_1', generate: false }, 'CORE');

      expect(el(fixture).textContent).toContain(FR.account.mandateNoneBody.CORE);
      expect(el(fixture).textContent).not.toContain('interentreprises');
    });

    it('brouillon B2B : la déclaration à la banque', () => {
      const fixture = boot({ ...DRAFT, scheme: 'B2B' });

      expect(el(fixture).textContent).toContain(FR.account.mandateAwaitingBody.B2B);
    });

    /**
     * 🔴 Le schéma du MANDAT l'emporte sur celui de l'émetteur : le client signe
     * le papier qu'il a imprimé, pas le réglage d'aujourd'hui.
     */
    it('brouillon CORE sous un émetteur passé B2B : le texte du papier, sans banque', () => {
      const fixture = boot(DRAFT, { companyId: 'cmp_1', generate: false }, 'B2B');

      expect(el(fixture).textContent).toContain(FR.account.mandateAwaitingBody.CORE);
      expect(el(fixture).textContent).not.toContain('banque');
      expect(el(fixture).textContent).not.toContain('interentreprises');
    });
  });

  it('ouvert depuis « Générer mon mandat », génère aussitôt et montre le brouillon', async () => {
    const fixture = boot(null, { companyId: 'cmp_1', generate: true });
    await settle(fixture);

    expect(wire.generates).toEqual(['cmp_1']);
    expect(el(fixture).textContent).toContain('RUM · LFD-MDT-0001');
    expect(el(fixture).textContent).toContain(FR.account.mandateAwaitingBody.CORE);
  });

  it('sans mandat et sans génération demandée, explique et propose de générer', async () => {
    const fixture = boot(null);
    expect(wire.generates).toEqual([]);
    expect(el(fixture).textContent).toContain(FR.account.mandateNoneBody.CORE);

    el(fixture).querySelector<HTMLButtonElement>('button.generate')?.click();
    await settle(fixture);
    expect(wire.generates).toEqual(['cmp_1']);
  });

  it('ouvert depuis « Générer » avec des mentions manquantes : ne génère pas, liste et désarme', async () => {
    const fixture = boot(null, { companyId: 'cmp_1', generate: true }, 'B2B', [
      'company_name_missing',
    ]);
    await settle(fixture);

    expect(wire.generates).toEqual([]);
    expect(el(fixture).querySelector('app-mandate-blockers')?.textContent).toContain(
      FR.account.mandateBlockers.company_name_missing,
    );
    expect(el(fixture).querySelector<HTMLButtonElement>('button.generate')?.disabled).toBe(true);
  });

  /** Un 409 `MandateMentionsMissingError` reçu malgré tout : son message, puis la liste relue. */
  it('un refus faute de mentions s’affiche avec son message et relit les mentions', async () => {
    const fixture = boot(null);
    wire.answer = 'Il manque le SIREN — Identité légale.';
    el(fixture).querySelector<HTMLButtonElement>('button.generate')?.click();
    await settle(fixture);

    expect(el(fixture).querySelector('fold-callout[variant="alert"]')?.textContent).toContain(
      'Il manque le SIREN — Identité légale.',
    );
    expect(wire.refreshes).toEqual(['cmp_1']);
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

  it('brouillon sans scan : consigne, voir et télécharger, et « Renvoyer le mandat signé »', () => {
    const fixture = boot(DRAFT);
    const host = el(fixture);

    expect(host.textContent).toContain(FR.account.mandateAwaiting);
    expect(host.textContent).toContain(FR.account.mandateAwaitingBody.CORE);
    expect(host.querySelector('button.view')?.textContent).toContain(FR.account.mandateView);
    expect(host.querySelector('button.download')?.textContent).toContain(
      FR.account.mandateDownload,
    );
    expect(host.querySelector('button.send')?.textContent).toContain(FR.account.mandateSend);
    // Déposer est une saisie : la zone et la signature électronique sont dans le dialogue.
    expect(host.querySelector('fold-file-dropzone')).toBeNull();
    expect(host.querySelector('button.esign-button')).toBeNull();
  });

  /** Règle « Saisir » : le dépôt s'ouvre en dialogue, empilé sur le panneau qui reste dessous. */
  it('« Renvoyer le mandat signé » empile le dialogue de dépôt, centré au bureau', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const fixture = boot(DRAFT);
    el(fixture).querySelector<HTMLButtonElement>('button.send')?.click();

    expect(openedPanel()?.component).toBe(MandateProofDialog);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1' });
    expect(openedPanel()?.side).toBe('center');
  });

  it('brouillon avec scan : le fichier, et un geste qui ouvre le dépôt pour le remplacer', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const fixture = boot({ ...DRAFT, hasProof: true, proofFileName: 'mandat-signe.pdf' });
    const host = el(fixture);

    expect(host.textContent).toContain(FR.account.mandateInReviewBody);
    expect(host.textContent).toContain('Fichier déposé : mandat-signe.pdf');
    const send = host.querySelector<HTMLButtonElement>('button.send');
    expect(send?.textContent).toContain(FR.account.mandateDropReplace);

    send?.click();
    expect(openedPanel()?.component).toBe(MandateProofDialog);
    expect(openedPanel()?.side).toBe('bottom');
  });

  it('actif : la RUM et la date du papier, ni PDF, ni dépôt, ni génération', () => {
    const fixture = boot({ ...DRAFT, status: 'active', hasProof: true, acceptedAt: '2026-09-10' });
    const host = el(fixture);

    expect(host.textContent).toContain(FR.account.mandateActive);
    expect(host.textContent).toContain(FR.account.mandateActiveBody);
    expect(host.textContent).toContain('Signé le 10/09/2026');
    expect(host.querySelector('button.send')).toBeNull();
    expect(host.querySelector('button.view')).toBeNull();
    expect(host.querySelector('button.generate')).toBeNull();
  });
});
