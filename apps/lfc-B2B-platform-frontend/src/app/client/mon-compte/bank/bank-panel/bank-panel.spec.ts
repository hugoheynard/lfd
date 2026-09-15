import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CustomerBankAccountView,
  SepaScheme,
  SetCompanyBankAccountPayload,
} from '@lfd/contracts';
import { BankAccountForm } from '@lfd/b2b-ui/payment';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { afterEach, vi } from 'vitest';
import { By } from '@angular/platform-browser';

import { NotifyService } from '../../../../notify.service';
import { ClientBankAccount } from '../../../client-bank-account.service';
import { ClientMandate } from '../../../client-mandate.service';
import { FR } from '../../../copy/fr';
import { matchMediaAt, openedPanel } from '../../account.fixture';
import { BankPanel, type BankPanelData } from './bank-panel';

const SAVED: CustomerBankAccountView = {
  holder: 'Refuge du Col SARL',
  holderLegalForm: 'SARL',
  addressLine1: '12 rue des Alpages',
  addressLine2: '',
  postalCode: '73150',
  city: 'Val d’Isère',
  countryCode: 'FR',
  bic: 'CEPAFRPP751',
  last4: '3041',
};

interface Wire {
  saves: { companyId: string; payload: SetCompanyBankAccountPayload }[];
  /** Les relectures du RIB et du mandat que `BankPanel.open` demande après un succès. */
  rereads: string[];
  answer: string | null;
  closes: unknown[];
  toasts: string[];
}

let wire: Wire;

function boot(
  data: BankPanelData,
  issuerScheme: SepaScheme | null = null,
): ComponentFixture<BankPanel> {
  wire = { saves: [], rereads: [], answer: null, closes: [], toasts: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BankPanel],
    providers: [
      {
        provide: ClientBankAccount,
        useValue: {
          save: (
            companyId: string,
            payload: SetCompanyBankAccountPayload,
          ): Promise<string | null> => {
            wire.saves.push({ companyId, payload });
            return Promise.resolve(wire.answer);
          },
          account: () => SAVED,
          reload: (companyId: string): Promise<void> => {
            wire.rereads.push(`rib:${companyId}`);
            return Promise.resolve();
          },
        },
      },
      {
        provide: ClientMandate,
        useValue: {
          issuerScheme: signal(issuerScheme),
          refresh: (companyId: string): Promise<void> => {
            wire.rereads.push(`mandat:${companyId}`);
            return Promise.resolve();
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
  const fixture = TestBed.createComponent(BankPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('BankPanel', () => {
  let fixture: ComponentFixture<BankPanel>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const inputs = (): HTMLInputElement[] => Array.from(el().querySelectorAll('input'));
  const submit = (): HTMLButtonElement | undefined =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('fold-panel-footer button')).at(-1);

  /**
   * Les champs, dans l'ordre : titulaire, civilité ou forme juridique, adresse,
   * complément, CP, ville, pays, IBAN, BIC.
   */
  const type = (index: number, value: string): void => {
    const input = inputs()[index];
    if (!input) {
      throw new Error(`Pas de champ n°${index}.`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const save = async (): Promise<void> => {
    submit()?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  /** Le formulaire est celui de la fiche staff : ce sont les mots de l'écran qu'il affiche, pas son défaut. */
  it('passe au formulaire partagé les libellés de l’écran, et ils s’affichent', () => {
    fixture = boot({ companyId: 'cmp_1', account: null });

    const form = fixture.debugElement.query(By.directive(BankAccountForm))
      .componentInstance as BankAccountForm;
    expect(form.labels()).toBe(FR.account.bankForm);
    for (const label of [
      FR.account.bankForm.holder,
      FR.account.bankForm.postalCode,
      FR.account.bankForm.iban,
      FR.account.bankForm.ibanHint,
    ]) {
      expect(el().textContent).toContain(label);
    }
    // Le client n'a pas d'exemple dans ses champs : ceux de la fiche staff n'y entrent pas.
    expect(el().querySelector('input[placeholder="Refuge du Col SARL"]')).toBeNull();
  });

  it('montre la civilité ou forme juridique du titulaire, dans les mots de l’écran', () => {
    fixture = boot({ companyId: 'cmp_1', account: null });

    expect(el().textContent).toContain(FR.account.bankForm.holderLegalForm);
    expect(el().textContent).toContain(FR.account.bankForm.holderLegalFormHint);
  });

  describe('la civilité ou forme juridique, exigée selon le schéma de l’émetteur', () => {
    const IBAN = 'FR14 2004 1010 0505 0001 3M02 606';
    const optionalMarks = (): number => el().querySelectorAll('.opt').length;

    it('interentreprises : vide, Enregistrer reste désarmé, et le champ n’est pas « facultatif »', () => {
      fixture = boot({ companyId: 'cmp_1', account: { ...SAVED, holderLegalForm: '' } }, 'B2B');
      type(7, IBAN);
      expect(submit()?.disabled).toBe(true);
      expect(optionalMarks()).toBe(0);

      type(1, 'SARL');
      expect(submit()?.disabled).toBe(false);
    });

    it('CORE ou schéma inconnu : vide, rien ne bloque, et le champ reste « facultatif »', () => {
      for (const scheme of ['CORE', null] as const) {
        fixture = boot({ companyId: 'cmp_1', account: { ...SAVED, holderLegalForm: '' } }, scheme);
        type(7, IBAN);
        expect(submit()?.disabled).toBe(false);
        expect(optionalMarks()).toBe(1);
      }
    });
  });

  it('au-delà de 40 caractères pour la forme juridique, Enregistrer reste désarmé', () => {
    fixture = boot({ companyId: 'cmp_1', account: SAVED });
    type(7, 'FR14 2004 1010 0505 0001 3M02 606');
    expect(submit()?.disabled).toBe(false);

    type(1, 'x'.repeat(41));
    expect(submit()?.disabled).toBe(true);
  });

  it('sans RIB, propose « Enregistrer », le pays par défaut, et reste fermé tant que tout manque', () => {
    fixture = boot({ companyId: 'cmp_1', account: null });

    expect(submit()?.textContent).toContain(FR.account.bankSave);
    expect(inputs()[6]?.value).toBe('FR');
    expect(submit()?.disabled).toBe(true);
  });

  it('reprend tout SAUF l’IBAN, et propose « Remplacer »', () => {
    fixture = boot({ companyId: 'cmp_1', account: SAVED });

    expect(inputs().map((input) => input.value)).toEqual([
      'Refuge du Col SARL',
      'SARL',
      '12 rue des Alpages',
      '',
      '73150',
      'Val d’Isère',
      'FR',
      '',
      'CEPAFRPP751',
    ]);
    expect(submit()?.textContent).toContain(FR.account.bankReplace);
    // Un compte enregistré ne suffit pas : l'IBAN se ressaisit.
    expect(submit()?.disabled).toBe(true);
  });

  it('écrit le compte entier, nettoyé, annonce et se ferme avec `true`', async () => {
    fixture = boot({ companyId: 'cmp_1', account: SAVED });
    type(6, 'fr');
    type(7, '  FR14 2004 1010 0505 0001 3M02 606 ');
    await save();

    expect(wire.saves).toEqual([
      {
        companyId: 'cmp_1',
        payload: {
          iban: 'FR14 2004 1010 0505 0001 3M02 606',
          bic: 'CEPAFRPP751',
          holder: 'Refuge du Col SARL',
          holderLegalForm: 'SARL',
          line1: '12 rue des Alpages',
          line2: '',
          postalCode: '73150',
          city: 'Val d’Isère',
          countryCode: 'FR',
        },
      },
    ]);
    expect(wire.toasts).toEqual([FR.account.bankSavedToast]);
    expect(wire.closes).toEqual([true]);
  });

  it('sur un refus, reste ouvert et montre le message du serveur', async () => {
    fixture = boot({ companyId: 'cmp_1', account: SAVED });
    wire.answer = 'IBAN invalide.';
    type(7, 'FR00');
    await save();

    expect(wire.closes).toEqual([]);
    const callout = el().querySelector('fold-callout[variant="alert"]');
    expect(callout?.textContent).toContain(FR.account.bankSaveFailed);
    expect(callout?.textContent).toContain('IBAN invalide.');
    expect(submit()?.disabled).toBe(false);
  });
  /**
   * Règle « Saisir » : Enregistrer attend une modification ET un compte complet.
   * L'IBAN ne redescend pas et la complétude l'exige : une ligne corrigée seule
   * n'arme rien tant qu'il n'est pas ressaisi (constaté le 2026-09-14).
   */
  it('une ligne corrigée sans IBAN reste désarmée ; l’IBAN ressaisi l’arme', () => {
    fixture = boot({ companyId: 'cmp_1', account: SAVED });
    expect(submit()?.disabled).toBe(true);

    type(3, 'Bâtiment B');
    expect(submit()?.disabled).toBe(true);

    type(7, 'FR14 2004 1010 0505 0001 3M02 606');
    expect(submit()?.disabled).toBe(false);
  });

  describe('open()', () => {
    afterEach(() => {
      TestBed.inject(FoldPanelHostService).dismissAll();
      vi.unstubAllGlobals();
    });

    /** Une saisie : feuille du bas sous le pli, dialogue centré au-delà (règle « Saisir »). */
    it('monte du bas sous le pli, et se centre au-delà', () => {
      boot({ companyId: 'cmp_1', account: SAVED });
      const panels = TestBed.inject(FoldPanelHostService);
      const accounts = TestBed.inject(ClientBankAccount);
      const mandates = TestBed.inject(ClientMandate);

      vi.stubGlobal('matchMedia', matchMediaAt(true));
      void BankPanel.open(panels, accounts, mandates, 'cmp_1');
      expect(openedPanel()).toEqual({
        component: BankPanel,
        side: 'bottom',
        data: { companyId: 'cmp_1', account: SAVED },
      });

      panels.dismissAll();
      vi.stubGlobal('matchMedia', matchMediaAt(false));
      void BankPanel.open(panels, accounts, mandates, 'cmp_1');
      expect(openedPanel()?.side).toBe('center');
    });

    /** Enregistrer le RIB révoque le brouillon de mandat côté serveur : les deux se relisent. */
    it('relit le RIB ET le mandat quand le dialogue se ferme sur un succès — rien sinon', async () => {
      boot({ companyId: 'cmp_1', account: SAVED });
      vi.stubGlobal('matchMedia', matchMediaAt(false));
      const panels = TestBed.inject(FoldPanelHostService);
      const accounts = TestBed.inject(ClientBankAccount);
      const mandates = TestBed.inject(ClientMandate);
      const close = async (result: boolean | undefined): Promise<void> => {
        const opening = BankPanel.open(panels, accounts, mandates, 'cmp_1');
        const [panel] = panels.panels();
        if (panel?.kind !== 'component') {
          throw new Error('Le dialogue ne s’est pas ouvert.');
        }
        panel.injector.get(FoldPanelRef).close(result);
        await opening;
      };

      await close(undefined);
      expect(wire.rereads).toEqual([]);

      await close(true);
      expect(wire.rereads).toEqual(['rib:cmp_1', 'mandat:cmp_1']);
    });
  });
});
