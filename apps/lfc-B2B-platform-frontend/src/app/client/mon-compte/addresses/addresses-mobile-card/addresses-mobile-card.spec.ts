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
import { AddressesMobileCard } from './addresses-mobile-card';

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
  procedureStepCount: 0,
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

describe('AddressesMobileCard', () => {
  it('garde la facturation en une ligne et le nombre de livraisons, sans la liste', () => {
    const el = bootCard(AddressesMobileCard, [TOMMEUSES], carnet(SIEGE, [CHALET]))
      .nativeElement as HTMLElement;

    expect(el.querySelector('.billing')?.textContent).toContain('12 chemin des Barmettes, 73150');
    // Régression : la carte disait « 1 adresses » (relevé le 2026-09-14).
    expect(el.querySelector('.count')?.textContent?.trim()).toBe(
      `${FR.account.deliveryHead} · 1 adresse`,
    );
    expect(el.textContent).not.toContain('Chalet');
    expect(el.textContent).not.toContain(FR.account.billingNote);
  });

  /** Deux boutons pleine largeur, chacun ouvrant le panneau sur SA partie du carnet. */
  it('« Facturation » et « Livraison » ouvrent chacun le panneau sur leur détail', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const el = bootCard(AddressesMobileCard, [asRole('billing')], carnet(null, []))
      .nativeElement as HTMLElement;
    expect(el.querySelector('.billing')?.textContent).toContain(FR.account.addressNone);

    const [billing, delivery] = Array.from(
      el.querySelectorAll<HTMLButtonElement>('app-card-foot button'),
    );
    expect(billing?.textContent).toContain(FR.account.billingHead);
    expect(delivery?.textContent).toContain(FR.account.deliveryHead);

    billing?.click();
    expect(openedPanel()?.component).toBe(AddressesPanel);
    expect(openedPanel()?.data).toEqual({
      companyId: 'cmp_1',
      canManage: false,
      view: 'billing',
    });

    TestBed.inject(FoldPanelHostService).dismissAll();
    delivery?.click();
    expect(openedPanel()?.data).toMatchObject({ view: 'delivery' });
  });
});
