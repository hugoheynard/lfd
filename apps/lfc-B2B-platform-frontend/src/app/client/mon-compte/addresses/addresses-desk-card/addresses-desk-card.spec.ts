import { type Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BillingAddressView, DeliveryAddressView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientAddresses } from '../../../client-addresses.service';
import { FR } from '../../../copy/fr';
import { ServicePoints } from '../../../shop/pickup-points.store';
import { asRole, bootCard, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { BillingAddressDialog } from '../billing-address-dialog/billing-address-dialog';
import { DeliveryAddressDialog } from '../delivery-address-dialog/delivery-address-dialog';
import { AddressesDeskCard } from './addresses-desk-card';

const SIEGE: BillingAddressView = {
  id: 'adr_siege',
  label: 'Siège',
  ligne1: '12 chemin des Barmettes',
  ligne2: '',
  codePostal: '73150',
  ville: "Val d'Isère",
  pays: 'France',
};

const CHALET: DeliveryAddressView = {
  ...SIEGE,
  id: 'adr_1',
  label: 'Chalet',
  isDefault: true,
  specs: {
    note: '',
    slots: { mode: 'everyday', slot: null },
    deliveryContact: null,
    gps: null,
    signatureRequired: null,
  },
};

function carnet(billing: BillingAddressView | null, deliveries: DeliveryAddressView[]): Provider[] {
  return [
    {
      provide: ClientAddresses,
      useValue: { billing: signal(billing), deliveries: signal(deliveries) },
    },
    { provide: ServicePoints, useValue: { zoneFor: () => null } },
  ];
}

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

describe('AddressesDeskCard', () => {
  const button = (el: HTMLElement, text: string): HTMLButtonElement | undefined =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button[foldButton]')).find((b) =>
      (b.textContent ?? '').includes(text),
    );

  it('garde la facturation, sa note, et la liste des livraisons', () => {
    const el = bootCard(AddressesDeskCard, [TOMMEUSES], carnet(SIEGE, [CHALET]))
      .nativeElement as HTMLElement;

    expect(el.textContent).toContain('12 chemin des Barmettes, 73150');
    expect(el.textContent).toContain(FR.account.billingNote);
    expect(el.querySelector('.delivery')?.textContent).toContain('Chalet');
    expect(el.textContent).toContain(FR.account.addressNoZone);
  });

  /** Régression : « Livraison · 1 adresses » (relevé le 2026-09-14). */
  it('accorde le nombre de livraisons : une adresse, puis deux adresses', () => {
    const one = bootCard(AddressesDeskCard, [TOMMEUSES], carnet(SIEGE, [CHALET]))
      .nativeElement as HTMLElement;
    expect(one.textContent).toContain(`${FR.account.deliveryHead} · 1 adresse`);
    expect(one.textContent).not.toContain('1 adresses');

    const two = bootCard(
      AddressesDeskCard,
      [TOMMEUSES],
      carnet(SIEGE, [CHALET, { ...CHALET, id: 'adr_2', label: 'Bureau', isDefault: false }]),
    ).nativeElement as HTMLElement;
    expect(two.textContent).toContain(`${FR.account.deliveryHead} · 2 adresses`);
  });

  it('ses gestes ouvrent leur dialogue, aux seuls rôles qui écrivent', () => {
    const reader = bootCard(AddressesDeskCard, [asRole('orders')], carnet(null, []))
      .nativeElement as HTMLElement;
    expect(reader.querySelectorAll('button').length).toBe(0);

    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const writer = bootCard(AddressesDeskCard, [TOMMEUSES], carnet(null, []))
      .nativeElement as HTMLElement;
    button(writer, FR.account.addressAdd)?.click();
    // Une livraison a son dialogue, centré au bureau (depuis le 2026-09-14).
    expect(openedPanel()).toEqual({
      component: DeliveryAddressDialog,
      side: 'center',
      data: {
        companyId: 'cmp_1',
        address: null,
        knownContacts: [{ prenom: 'Hugo', nom: 'Heynard', telephone: '06 12 44 08 71' }],
        signatureFloor: false,
        firstOfBook: true,
      },
    });

    TestBed.inject(FoldPanelHostService).dismissAll();
    button(writer, FR.account.billingFill)?.click();
    // La facturation a son dialogue aussi (depuis le 2026-09-14).
    expect(openedPanel()).toEqual({
      component: BillingAddressDialog,
      side: 'center',
      data: { companyId: 'cmp_1', billing: null },
    });
  });

  /** Rétablis le 2026-09-14 : « Modifier la facturation » et « Modifier » par livraison. */
  it('« Modifier la facturation » et « Modifier » une livraison ouvrent chacun leur dialogue', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const el = bootCard(AddressesDeskCard, [TOMMEUSES], carnet(SIEGE, [CHALET]))
      .nativeElement as HTMLElement;

    button(el, FR.account.billingEdit)?.click();
    expect(openedPanel()?.component).toBe(BillingAddressDialog);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', billing: SIEGE });

    TestBed.inject(FoldPanelHostService).dismissAll();
    el.querySelector<HTMLButtonElement>('.delivery button.row-edit')?.click();
    expect(openedPanel()?.component).toBe(DeliveryAddressDialog);
    expect(openedPanel()?.data).toMatchObject({ address: CHALET, firstOfBook: false });
  });
});
