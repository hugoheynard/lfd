import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CompanyBankAccountView, SetMandateOptionsPayload } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { BankAccountService } from '../bank-account/bank-account.service';
import { MandateOptionsSection } from '../mandate-options-section/mandate-options-section';

const SAVED: CompanyBankAccountView = {
  holder: 'Refuge du Col SARL',
  addressLine1: '12 rue des Alpages',
  addressLine2: '',
  postalCode: '73150',
  city: "Val d'Isère",
  countryCode: 'FR',
  bic: 'CEPAFRPP751',
  last4: '2606',
  debtorReference: 'C-9P2X4B',
  contractNumber: '',
  contractDescription: 'Fourniture de café',
};

interface Rendered {
  readonly host: HTMLElement;
  readonly section: MandateOptionsSection;
  readonly written: SetMandateOptionsPayload[];
  readonly setAccount: (account: CompanyBankAccountView | null) => void;
  readonly settle: () => Promise<void>;
}

function render(options: {
  readonly account?: CompanyBankAccountView | null;
  readonly companyId?: string | null;
}): Rendered {
  const written: SetMandateOptionsPayload[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: BankAccountService,
        useValue: {
          saveOptions: (_id: string, payload: SetMandateOptionsPayload): Promise<void> => {
            written.push(payload);
            return Promise.resolve();
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(MandateOptionsSection);
  fixture.componentRef.setInput('companyId', options.companyId ?? 'cmp_1');
  fixture.componentRef.setInput('companyLabel', 'Refuge du Col SARL');
  fixture.componentRef.setInput('account', options.account ?? null);
  fixture.detectChanges();

  return {
    host: fixture.nativeElement as HTMLElement,
    section: fixture.componentInstance,
    written,
    setAccount: (account): void => {
      fixture.componentRef.setInput('account', account);
      fixture.detectChanges();
    },
    settle: async (): Promise<void> => {
      await fixture.whenStable();
      fixture.detectChanges();
    },
  };
}

describe('zones facultatives du mandat', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it("annonce qu'elles sont facultatives — la norme les dit indicatives", () => {
    const { host } = render({ account: SAVED });
    expect(host.textContent).toContain('facultatives');
  });

  /**
   * Un refus qu'on pouvait prévoir se lit comme une panne. Le serveur refuse
   * sans RIB — ces zones vivent sur la même ligne que lui — donc on le dit
   * avant de laisser cliquer.
   */
  it('dit quoi faire d’abord quand le client n’a pas de RIB', () => {
    const { host, section } = render({ account: null });

    expect(section['ready']()).toBe(false);
    expect(host.textContent).toContain("renseignez-le à l'étape 1");
  });

  it('reprend les zones enregistrées quand le RIB arrive', async () => {
    // Le RIB est chargé par le bloc voisin : il est `null` au premier rendu.
    const { section, setAccount } = render({ account: null });
    expect(section['debtorReferenceDraft']()).toBe('');

    setAccount(SAVED);
    expect(section['debtorReferenceDraft']()).toBe('C-9P2X4B');
    expect(section['contractDescriptionDraft']()).toBe('Fourniture de café');
  });

  /**
   * 🔴 Sans cette garde, la relecture qui suit l'enregistrement du RIB voisin
   * écraserait une saisie en cours — et l'écran ne le dirait pas.
   */
  it("n'écrase JAMAIS ce qu'on est en train de taper", () => {
    const { section, setAccount } = render({ account: SAVED });

    section['contractNumberDraft'].set('CT-42');
    section['markTouched']();
    setAccount({ ...SAVED, contractNumber: 'AUTRE' });

    expect(section['contractNumberDraft']()).toBe('CT-42');
  });

  it('envoie les trois zones, rognées', async () => {
    const { section, written, settle } = render({ account: SAVED });

    section['contractNumberDraft'].set('  CT-42  ');
    await section['save']();
    await settle();

    expect(written).toEqual([
      {
        debtorReference: 'C-9P2X4B',
        contractNumber: 'CT-42',
        contractDescription: 'Fourniture de café',
      },
    ]);
  });

  it("n'écrit rien tant que le RIB manque", async () => {
    const { section, written } = render({ account: null });
    await section['save']();
    expect(written).toHaveLength(0);
  });

  it('offre de prévisualiser le mandat, pas de le générer', () => {
    // Le parcours de signature n'existe pas : proposer « Générer » promettrait
    // un document que personne ne peut produire.
    const { host } = render({ account: SAVED });
    expect(host.textContent).toContain('Prévisualiser le mandat');
    expect(host.textContent).not.toContain('Générer');
  });
});
