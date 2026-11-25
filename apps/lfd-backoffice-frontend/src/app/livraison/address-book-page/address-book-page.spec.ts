import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  DeliveryAddressBookView,
  DeliveryDayAddressesView,
  DeliveryProcedureView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { PermissionsStore } from '../../auth/permissions.store';
import {
  doorstepRuleLabelOf,
  filterAddressBook,
  gpsLabelOf,
  osmUrlOf,
  stopMinutesLabelOf,
} from '../address-book';
import { readHiddenColumns, writeHiddenColumns } from '../address-book-columns';
import { addressBookRowOf } from '../address-book.fixture';
import { parisDayOf, shiftDay } from '../run-sheet';
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
      signatureRequired: true,
      signatureSource: 'address',
      hasProcedure: true,
    }),
  ],
};

async function settle(fixture: ComponentFixture<AddressBookPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const PROCEDURE_URL = `${B2B_API_BASE}/admin/companies/c1/delivery-addresses/a2/procedure`;

async function boot(canReadProcedure = true): Promise<{
  fixture: ComponentFixture<AddressBookPage>;
  element: HTMLElement;
  http: HttpTestingController;
}> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: string) =>
            canReadProcedure || permission !== 'delivery_procedures:read',
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AddressBookPage);
  fixture.detectChanges();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    http: TestBed.inject(HttpTestingController),
  };
}

describe('AddressBookPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('masque stationnement, dépôt, règle et temps sur place par défaut, et montre une colonne cochée', async () => {
    const { fixture, element, http } = await boot();
    http.expectOne(URL).flush(VIEW);
    await settle(fixture);
    const headers = (): string => element.querySelector('thead')?.textContent ?? '';
    expect(headers()).not.toContain('Stationnement');
    expect(
      Array.from(element.querySelectorAll('thead th')).map((th) => th.textContent?.trim()),
    ).toEqual([
      'Client',
      'Adresse',
      'Contact',
      'Note livreurs',
      'Livraison',
      'Signature BL',
      'Procédure détaillée',
    ]);
    expect(element.querySelector('[data-gps]')?.textContent).toContain('GPS');

    element.querySelector<HTMLElement>('[data-columns] button')?.click();
    await settle(fixture);
    element.querySelector<HTMLInputElement>('[data-column-toggle="parking"] input')?.click();
    await settle(fixture);

    expect(headers()).toContain('Stationnement');
    expect(readHiddenColumns(localStorage)).toEqual(['rule', 'stop', 'deposit']);
  });

  it('reprend les colonnes masquées retenues par ce navigateur', async () => {
    writeHiddenColumns(localStorage, ['note']);
    const { fixture, element, http } = await boot();
    http.expectOne(URL).flush(VIEW);
    await settle(fixture);
    const headers = element.querySelector('thead')?.textContent ?? '';
    expect(headers).not.toContain('Note livreurs');
    expect(headers).toContain('Stationnement');
  });

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

  it('coche la signature BL exigée et dit « (société) » quand elle est héritée', async () => {
    const { fixture, element, http } = await boot();
    http.expectOne(URL).flush(VIEW);
    await settle(fixture);

    const [inherited, own] = Array.from(element.querySelectorAll('[data-signature]'));
    expect(inherited?.querySelector('[data-signature-required]')).toBeNull();
    expect(inherited?.querySelector('[data-signature-inherited]')?.textContent).toContain(
      '(société)',
    );
    expect(own?.querySelector('[data-signature-required]')).not.toBeNull();
    expect(own?.textContent).toContain('Signature exigée');
    expect(own?.querySelector('[data-signature-inherited]')).toBeNull();
  });

  it('ne lit la procédure qu’à l’ouverture de l’œil, puis montre ses étapes dans l’ordre', async () => {
    const { fixture, element, http } = await boot();
    const book: DeliveryAddressBookView = {
      addresses: [addressBookRowOf({ addressId: 'a2', companyId: 'c1', hasProcedure: true })],
    };
    http.expectOne(URL).flush(book);
    await settle(fixture);
    http.expectNone(PROCEDURE_URL);
    expect(element.querySelectorAll('[data-procedure-open]')).toHaveLength(1);

    element.querySelector<HTMLElement>('[data-procedure-open] button')?.click();
    await settle(fixture);
    http.expectOne(PROCEDURE_URL).flush({
      addressId: 'a2',
      steps: [
        { id: 's1', number: 1, title: 'Portail', body: 'Code 1234', photoRevision: null },
        { id: 's2', number: 2, title: 'Réserve', body: '', photoRevision: null },
      ],
    } satisfies DeliveryProcedureView);
    // La lecture de la passerelle se résout hors de la détection de changements.
    await new Promise((resolve) => setTimeout(resolve));
    await settle(fixture);

    const steps = Array.from(element.querySelectorAll('[data-procedure-step]')).map((step) =>
      step.querySelector('strong')?.textContent?.trim(),
    );
    expect(steps).toEqual(['1. Portail', '2. Réserve']);
    expect(element.textContent).toContain('Code 1234');
    http.verify();
  });

  it('demain : lit les livraisons du jour et les classe par heure, avec leurs commandes', async () => {
    const { fixture, element, http } = await boot();
    http.expectOne(URL).flush(VIEW);
    await settle(fixture);
    expect(element.querySelector('thead')?.textContent).not.toContain('Heure');

    const tomorrow = shiftDay(parisDayOf(new Date()), 1);
    const buttons = Array.from(element.querySelectorAll<HTMLElement>('[data-view-toggle] button'));
    buttons.find((button) => button.textContent?.includes('Demain'))?.click();
    await settle(fixture);
    expect(element.querySelector('fold-loading')).not.toBeNull();

    const order = {
      customerLabel: 'Café Bastille',
      companyId: 'c1',
      address: null,
    } as const;
    http.expectOne(`${URL}/day/${tomorrow}`).flush({
      day: tomorrow,
      orders: [
        {
          ...order,
          orderId: 'o1',
          reference: 'C-9',
          addressId: 'a2',
          window: { start: null, end: '11:00' },
        },
        {
          ...order,
          orderId: 'o2',
          reference: 'C-3',
          addressId: 'a1',
          window: { start: '07:00', end: '09:00' },
        },
        {
          ...order,
          orderId: 'o3',
          reference: 'C-4',
          addressId: 'a1',
          window: { start: '07:00', end: '09:00' },
        },
      ],
    } satisfies DeliveryDayAddressesView);
    await new Promise((resolve) => setTimeout(resolve));
    await settle(fixture);

    expect(
      Array.from(element.querySelectorAll('[data-time]')).map((cell) => cell.textContent?.trim()),
    ).toEqual(['07:00–09:00', 'avant 11:00']);
    expect(element.querySelector('[data-orders]')?.textContent).toContain('C-3');
    expect(element.querySelector('[data-orders]')?.textContent).toContain('C-4');
    expect(element.querySelector('[data-count]')?.textContent).toContain(
      '2 adresses · 3 livraisons',
    );
    http.verify();
  });

  it('sans le droit de lire les procédures, pas d’œil', async () => {
    const { fixture, element, http } = await boot(false);
    http.expectOne(URL).flush(VIEW);
    await settle(fixture);
    expect(element.querySelector('[data-procedure-open]')).toBeNull();
    http.verify();
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

describe('readHiddenColumns', () => {
  it('rend le réglage par défaut sans mémoire, ou sur une mémoire illisible', () => {
    localStorage.clear();
    expect(readHiddenColumns(localStorage)).toEqual(['parking', 'rule', 'stop', 'deposit']);
    expect(readHiddenColumns(null)).toEqual(['parking', 'rule', 'stop', 'deposit']);
    localStorage.setItem('lfd.tour-manager.address-book.hidden-columns', '{pas du json');
    expect(readHiddenColumns(localStorage)).toEqual(['parking', 'rule', 'stop', 'deposit']);
    localStorage.setItem('lfd.tour-manager.address-book.hidden-columns', '[1,2]');
    expect(readHiddenColumns(localStorage)).toEqual(['parking', 'rule', 'stop', 'deposit']);
  });
});
