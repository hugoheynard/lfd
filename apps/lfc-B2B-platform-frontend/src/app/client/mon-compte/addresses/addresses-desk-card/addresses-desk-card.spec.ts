import { type Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BillingAddressView, DeliveryAddressView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { ClientAddresses } from '../../../client-addresses.service';
import { FR } from '../../../copy/fr';
import { ServicePoints } from '../../../shop/pickup-points.store';
import { asRole, bootCard, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { AddressesPanel } from '../addresses-panel/addresses-panel';
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

  it('ses gestes ouvrent le panneau sur leur formulaire, aux seuls rôles qui écrivent', () => {
    const reader = bootCard(AddressesDeskCard, [asRole('orders')], carnet(null, []))
      .nativeElement as HTMLElement;
    expect(reader.querySelectorAll('button').length).toBe(0);

    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const writer = bootCard(AddressesDeskCard, [TOMMEUSES], carnet(null, []))
      .nativeElement as HTMLElement;
    button(writer, FR.account.addressAdd)?.click();
    expect(openedPanel()?.component).toBe(AddressesPanel);
    expect(openedPanel()?.data).toEqual({
      companyId: 'cmp_1',
      canManage: true,
      view: 'delivery',
      form: { kind: 'new' },
    });

    TestBed.inject(FoldPanelHostService).dismissAll();
    button(writer, FR.account.billingFill)?.click();
    expect(openedPanel()?.data).toMatchObject({
      view: 'billing',
      form: { kind: 'edit', addressId: null },
    });
  });

  /** Rétablis le 2026-09-14 : « Modifier la facturation » et « Modifier » par livraison. */
  it('« Modifier la facturation » et « Modifier » une livraison ouvrent leur formulaire', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const el = bootCard(AddressesDeskCard, [TOMMEUSES], carnet(SIEGE, [CHALET]))
      .nativeElement as HTMLElement;

    button(el, FR.account.billingEdit)?.click();
    expect(openedPanel()?.data).toMatchObject({
      view: 'billing',
      form: { kind: 'edit', addressId: null },
    });

    TestBed.inject(FoldPanelHostService).dismissAll();
    el.querySelector<HTMLButtonElement>('.delivery button.row-edit')?.click();
    expect(openedPanel()?.data).toMatchObject({
      view: 'delivery',
      form: { kind: 'edit', addressId: 'adr_1' },
    });
  });
});
