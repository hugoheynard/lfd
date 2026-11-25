import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DeliveryAddressBookView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import {
  doorstepRuleLabelOf,
  filterAddressBook,
  gpsLabelOf,
  osmUrlOf,
  stopMinutesLabelOf,
} from '../address-book';
import { addressBookRowOf } from '../address-book.fixture';
import { AddressBookPage } from './address-book-page';

const URL = `${B2B_API_BASE}/admin/delivery/address-book`;

const VIEW: DeliveryAddressBookView = {
  addresses: [
    addressBookRowOf(),
    addressBookRowOf({
      addressId: 'a2',
      tradeName: '',
      legalName: 'Café Bastille',
      addressLabel: 'Bastille',
      ville: 'Annecy',
      isDefault: false,
      door: null,
      parking: null,
      note: '',
      deliveryContact: null,
      depositAllowed: true,
      doorstepRule: 'bring_back',
      stopMinutes: 7,
      hasProcedure: true,
    }),
  ],
};

async function settle(fixture: ComponentFixture<AddressBookPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(): Promise<{
  fixture: ComponentFixture<AddressBookPage>;
  element: HTMLElement;
  http: HttpTestingController;
}> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(AddressBookPage);
  fixture.detectChanges();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    http: TestBed.inject(HttpTestingController),
  };
}

describe('AddressBookPage', () => {
  it('attend le carnet, puis montre chaque adresse et le compte', async () => {
    const { fixture, element, http } = await boot();
    expect(element.querySelector('fold-loading')).not.toBeNull();

    http.expectOne(URL).flush(VIEW);
    await settle(fixture);

    expect(element.querySelector('fold-loading')).toBeNull();
    expect(element.textContent).toContain('Hôtel du Parc SAS');
    expect(element.textContent).toContain('Café Bastille');
    expect(element.querySelector('[data-count]')?.textContent).toContain('2 adresses');
    expect(element.querySelectorAll('[data-default]')).toHaveLength(1);
    expect(element.querySelector('[data-door]')?.textContent).toContain('45.566080, 5.918000');
    expect(element.textContent).toContain('Rapporter');
    expect(element.textContent).toContain('Réglage global');
    http.verify();
  });

  it('met l’enseigne en gras, la raison sociale dessous, et la raison sociale seule à défaut', async () => {
    const { fixture, element, http } = await boot();
    http.expectOne(URL).flush(VIEW);
    await settle(fixture);

    const [withTrade, without] = Array.from(element.querySelectorAll('[data-customer]'));
    expect(withTrade?.querySelector('strong')?.textContent?.trim()).toBe('Hôtel du Parc');
    expect(withTrade?.querySelector('[data-legal-name]')?.textContent?.trim()).toBe(
      'Hôtel du Parc SAS',
    );
    expect(without?.querySelector('[data-trade-name]')).toBeNull();
    expect(without?.querySelector('strong')?.textContent?.trim()).toBe('Café Bastille');
  });

  it('dit l’échec et relit au « Réessayer »', async () => {
    const { fixture, element, http } = await boot();
    http.expectOne(URL).flush('down', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(element.querySelector('[data-error]')).not.toBeNull();

    element.querySelector<HTMLButtonElement>('[data-error] button')?.click();
    http.expectOne(URL).flush(VIEW);
    await settle(fixture);
    expect(element.querySelector('[data-error]')).toBeNull();
    expect(element.textContent).toContain('Café Bastille');
  });

  it('dit le carnet vide plutôt qu’une table muette', async () => {
    const { fixture, element, http } = await boot();
    http.expectOne(URL).flush({ addresses: [] } satisfies DeliveryAddressBookView);
    await settle(fixture);
    expect(element.textContent).toContain('Aucune adresse de livraison');
  });
});

describe('le carnet d’adresses, en mots', () => {
  it('cherche par client, ville, libellé ou note, sans accents ni casse', () => {
    const rows = VIEW.addresses;
    const ids = (query: string, withoutGpsOnly = false) =>
      filterAddressBook(rows, { query, withoutGpsOnly }).map((row) => row.addressId);
    expect(ids('')).toEqual(['a1', 'a2']);
    expect(ids('chambery')).toEqual(['a1']);
    expect(ids('BASTILLE')).toEqual(['a2']);
    expect(ids('réception')).toEqual(['a1']);
    expect(ids('', true)).toEqual(['a2']);
    expect(ids('chambery', true)).toEqual([]);
  });

  it('écrit les points, la règle et le temps comme l’équipe les lit', () => {
    const point = { lat: 45.56608, lng: 5.918 };
    expect(gpsLabelOf(point)).toBe('45.566080, 5.918000');
    expect(osmUrlOf(point)).toBe(
      'https://www.openstreetmap.org/?mlat=45.566080&mlon=5.918000#map=19/45.566080/5.918000',
    );
    expect(doorstepRuleLabelOf('ask')).toBe('Demander');
    expect(doorstepRuleLabelOf('deposit')).toBe('Déposer');
    expect(doorstepRuleLabelOf(null)).toBe('Réglage global');
    expect(stopMinutesLabelOf(null)).toBe('global');
    expect(stopMinutesLabelOf(5)).toBe('5 min');
  });
});
