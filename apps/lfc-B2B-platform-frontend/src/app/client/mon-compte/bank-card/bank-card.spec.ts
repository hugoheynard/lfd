import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CustomerBankAccountSectionView,
  CustomerBankAccountView,
  SetCompanyBankAccountPayload,
} from '@lfd/contracts';

import { NotifyService } from '../../../notify.service';
import { ClientBankAccount } from '../../client-bank-account.service';
import { ClientCompany } from '../../client-company.service';
import { FR } from '../../copy/fr';
import { BankCard } from './bank-card';

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

/** Ce que le doublé du service a vu passer, et ce qu'il rend. */
interface Wire {
  reads: number;
  saves: { companyId: string; payload: SetCompanyBankAccountPayload }[];
  next: () => Promise<CustomerBankAccountSectionView>;
}

let wire: Wire;

async function boot(
  next: () => Promise<CustomerBankAccountSectionView>,
): Promise<ComponentFixture<BankCard>> {
  wire = { reads: 0, saves: [], next };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BankCard],
    providers: [
      { provide: ClientCompany, useValue: { company: signal({ id: 'cmp_1' }) } },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: ClientBankAccount,
        useValue: {
          read: (): Promise<CustomerBankAccountSectionView> => {
            wire.reads += 1;
            return wire.next();
          },
          save: (companyId: string, payload: SetCompanyBankAccountPayload): Promise<void> => {
            wire.saves.push({ companyId, payload });
            return Promise.resolve();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(BankCard);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('BankCard', () => {
  let fixture: ComponentFixture<BankCard>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const inputs = (): HTMLInputElement[] => Array.from(el().querySelectorAll('input'));
  const submit = (): HTMLButtonElement | null => el().querySelector('button.submit');

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

  it('sans RIB, le dit, propose « Enregistrer » et garde le bouton fermé tant que tout manque', async () => {
    fixture = await boot(() => Promise.resolve({ account: null }));

    expect(el().querySelector('.saved')?.textContent).toContain(FR.account.bankNone);
    expect(submit()?.textContent).toContain(FR.account.bankSave);
    expect(inputs()[5]?.value).toBe('FR');
    expect(submit()?.disabled).toBe(true);
  });

  it('montre le compte masqué, reprend tout SAUF l’IBAN, et propose « Remplacer »', async () => {
    fixture = await boot(() => Promise.resolve({ account: SAVED }));

    expect(el().querySelector('.saved')?.textContent).toContain(
      '•••• 3041 · BIC CEPAFRPP751 · Refuge du Col SARL',
    );
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

  it('écrit le compte entier, nettoyé, puis relit et vide l’IBAN', async () => {
    fixture = await boot(() => Promise.resolve({ account: SAVED }));
    type(5, 'fr');
    type(6, '  FR14 2004 1010 0505 0001 3M02 606 ');

    submit()?.click();
    await fixture.whenStable();
    fixture.detectChanges();

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
    expect(wire.reads).toBe(2);
    expect(inputs()[6]?.value).toBe('');
  });

  it('dit l’échec de lecture au lieu d’un formulaire vide, et relit au clic', async () => {
    fixture = await boot(() => Promise.reject(new Error('503')));

    expect(el().textContent).toContain(FR.account.bankLoadFailedTitle);
    expect(el().querySelector('fold-input')).toBeNull();

    wire.next = () => Promise.resolve({ account: null });
    el().querySelector<HTMLButtonElement>('fold-empty-state button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(wire.reads).toBe(2);
    expect(el().querySelector('fold-input')).not.toBeNull();
  });
});
