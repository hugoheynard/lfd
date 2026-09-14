import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AddressForm, DEFAULT_POSTAL_FIELDS, type PostalAddress } from '@lfd/b2b-ui/address';
import type { BillingAddressPayload, BillingAddressView } from '@lfd/contracts';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { ClientAddresses } from '../../../client-addresses.service';
import { FR } from '../../../copy/fr';
import { matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { BillingAddressDialog, type BillingAddressDialogData } from './billing-address-dialog';

const SIEGE: BillingAddressView = {
  id: 'adr_siege',
  label: 'Siège',
  ligne1: '12 chemin des Barmettes',
  ligne2: '',
  codePostal: '73150',
  ville: "Val d'Isère",
  pays: 'France',
};

/** Ce que l'on tape : une adresse postale complète, sans note ni point. */
const TYPED: PostalAddress = {
  label: 'Bureau',
  line1: '3 place du Village',
  line2: 'Bâtiment B',
  postalCode: '73320',
  city: 'Tignes',
  country: 'France',
  latitude: '',
  longitude: '',
  note: '',
};

const FILL: BillingAddressDialogData = { companyId: 'cmp_1', billing: null };

interface Wire {
  saves: { companyId: string; payload: BillingAddressPayload }[];
  answer: string | null;
  closes: unknown[];
  toasts: string[];
}

let wire: Wire;

function boot(data: BillingAddressDialogData): ComponentFixture<BillingAddressDialog> {
  wire = { saves: [], answer: null, closes: [], toasts: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BillingAddressDialog],
    providers: [
      {
        provide: ClientAddresses,
        useValue: {
          saveBilling: (
            companyId: string,
            payload: BillingAddressPayload,
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
  const fixture = TestBed.createComponent(BillingAddressDialog);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<BillingAddressDialog>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const form = (fixture: ComponentFixture<BillingAddressDialog>): AddressForm =>
  fixture.debugElement.query(By.directive(AddressForm)).componentInstance as AddressForm;

const submitButton = (fixture: ComponentFixture<BillingAddressDialog>): HTMLButtonElement | null =>
  host(fixture).querySelector<HTMLButtonElement>('button.submit');

function type(fixture: ComponentFixture<BillingAddressDialog>, address: PostalAddress): void {
  form(fixture).value.set(address);
  fixture.detectChanges();
}

async function submit(fixture: ComponentFixture<BillingAddressDialog>): Promise<void> {
  submitButton(fixture)?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BillingAddressDialog', () => {
  it('création : « Renseigner », un formulaire vide, les champs postaux seuls et les mots de l’écran', () => {
    const fixture = boot(FILL);

    expect(host(fixture).querySelector('fold-panel-header')?.textContent).toContain(
      FR.account.billingFill,
    );
    expect(form(fixture).value().line1).toBe('');
    // Une facture ne se livre pas : ni note, ni point GPS.
    expect(form(fixture).fields()).toEqual(DEFAULT_POSTAL_FIELDS);
    expect(form(fixture).labels()).toBe(FR.account.addressForm);
  });

  it('désarme l’envoi tant que l’adresse postale est incomplète', () => {
    const fixture = boot(FILL);
    expect(submitButton(fixture)?.disabled).toBe(true);

    type(fixture, { ...TYPED, city: '' });
    expect(submitButton(fixture)?.disabled).toBe(true);

    type(fixture, TYPED);
    expect(submitButton(fixture)?.disabled).toBe(false);
  });

  it('correction : « Modifier », préremplie depuis la facturation posée', () => {
    const fixture = boot({ ...FILL, billing: SIEGE });

    expect(host(fixture).querySelector('fold-panel-header')?.textContent).toContain(
      FR.account.billingEdit,
    );
    expect(form(fixture).value()).toMatchObject({
      label: 'Siège',
      line1: '12 chemin des Barmettes',
      postalCode: '73150',
      city: "Val d'Isère",
      country: 'France',
    });
  });

  it('envoie la charge postale seule, toaste et ferme avec `true`', async () => {
    const fixture = boot({ ...FILL, billing: SIEGE });
    type(fixture, TYPED);
    await submit(fixture);

    expect(wire.saves).toEqual([
      {
        companyId: 'cmp_1',
        payload: {
          label: 'Bureau',
          ligne1: '3 place du Village',
          ligne2: 'Bâtiment B',
          codePostal: '73320',
          ville: 'Tignes',
          pays: 'France',
        },
      },
    ]);
    expect(wire.toasts).toEqual([FR.account.addressSavedToast]);
    expect(wire.closes).toEqual([true]);
  });

  it('un refus du serveur s’affiche dans le dialogue, qui reste ouvert', async () => {
    const fixture = boot(FILL);
    type(fixture, TYPED);
    wire.answer = 'Seul le détenteur ou un administrateur peut modifier le carnet.';
    await submit(fixture);

    const alert = host(fixture).querySelector('fold-callout[variant="alert"]');
    expect(alert?.textContent).toContain(FR.account.addressSaveFailed);
    expect(alert?.textContent).toContain('Seul le détenteur ou un administrateur');
    expect(wire.closes).toEqual([]);
    expect(wire.toasts).toEqual([]);
    expect(submitButton(fixture)?.disabled).toBe(false);
  });

  describe('ouverture', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
    });

    afterEach(() => {
      TestBed.inject(FoldPanelHostService).dismissAll();
    });

    it('en feuille du bas sous le pli', () => {
      vi.stubGlobal('matchMedia', matchMediaAt(true));
      BillingAddressDialog.open(TestBed.inject(FoldPanelHostService), TOMMEUSES, null);

      expect(openedPanel()).toEqual({
        component: BillingAddressDialog,
        side: 'bottom',
        data: { companyId: 'cmp_1', billing: null },
      });
    });

    it('en dialogue centré au-delà du pli', () => {
      vi.stubGlobal('matchMedia', matchMediaAt(false));
      BillingAddressDialog.open(TestBed.inject(FoldPanelHostService), TOMMEUSES, SIEGE);

      expect(openedPanel()?.side).toBe('center');
      expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', billing: SIEGE });
    });
  });
});
