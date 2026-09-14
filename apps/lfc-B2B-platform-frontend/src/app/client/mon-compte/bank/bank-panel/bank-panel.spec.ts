import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CustomerBankAccountView, SetCompanyBankAccountPayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { ClientBankAccount } from '../../../client-bank-account.service';
import { FR } from '../../../copy/fr';
import { BankPanel, type BankPanelData } from './bank-panel';

const SAVED: CustomerBankAccountView = {
  holder: 'Refuge du Col SARL',
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
  answer: string | null;
  closes: unknown[];
  toasts: string[];
}

let wire: Wire;

function boot(data: BankPanelData): ComponentFixture<BankPanel> {
  wire = { saves: [], answer: null, closes: [], toasts: [] };
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

  /** Les champs, dans l'ordre : titulaire, adresse, complément, CP, ville, pays, IBAN, BIC. */
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

  it('sans RIB, propose « Enregistrer », le pays par défaut, et reste fermé tant que tout manque', () => {
    fixture = boot({ companyId: 'cmp_1', account: null });

    expect(submit()?.textContent).toContain(FR.account.bankSave);
    expect(inputs()[5]?.value).toBe('FR');
    expect(submit()?.disabled).toBe(true);
  });

  it('reprend tout SAUF l’IBAN, et propose « Remplacer »', () => {
    fixture = boot({ companyId: 'cmp_1', account: SAVED });

    expect(inputs().map((input) => input.value)).toEqual([
      'Refuge du Col SARL',
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
    type(5, 'fr');
    type(6, '  FR14 2004 1010 0505 0001 3M02 606 ');
    await save();

    expect(wire.saves).toEqual([
      {
        companyId: 'cmp_1',
        payload: {
          iban: 'FR14 2004 1010 0505 0001 3M02 606',
          bic: 'CEPAFRPP751',
          holder: 'Refuge du Col SARL',
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
    type(6, 'FR00');
    await save();

    expect(wire.closes).toEqual([]);
    const callout = el().querySelector('fold-callout[variant="alert"]');
    expect(callout?.textContent).toContain(FR.account.bankSaveFailed);
    expect(callout?.textContent).toContain('IBAN invalide.');
    expect(submit()?.disabled).toBe(false);
  });
});
