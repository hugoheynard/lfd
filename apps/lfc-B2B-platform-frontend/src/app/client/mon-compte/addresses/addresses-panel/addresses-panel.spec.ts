import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AddressForm, type PostalAddress } from '@lfd/b2b-ui/address';
import type {
  BillingAddressPayload,
  BillingAddressView,
  DeliveryAddressPayload,
  DeliveryAddressView,
} from '@lfd/contracts';

import { NotifyService } from '../../../../notify.service';
import { ClientAddresses } from '../../../client-addresses.service';
import { FR } from '../../../copy/fr';
import { ServicePoints } from '../../../shop/pickup-points.store';
import { AddressesPanel, type AddressesPanelData } from './addresses-panel';

const CHALET: DeliveryAddressView = {
  id: 'adr_1',
  label: 'Chalet',
  ligne1: '1 route du Col',
  ligne2: '',
  codePostal: '73150',
  ville: "Val d'Isère",
  pays: 'France',
  isDefault: true,
  specs: {
    note: '',
    slots: { mode: 'everyday', slot: null },
    deliveryContact: null,
    gps: null,
    signatureRequired: null,
  },
};

const SIEGE: BillingAddressView = {
  id: 'adr_siege',
  label: 'Siège',
  ligne1: '12 chemin des Barmettes',
  ligne2: '',
  codePostal: '73150',
  ville: "Val d'Isère",
  pays: 'France',
};

/** Ce que l'on tape dans le formulaire. */
const TYPED: PostalAddress = {
  label: 'Bureau',
  line1: '3 place du Village',
  line2: '',
  postalCode: '73320',
  city: 'Tignes',
  country: 'France',
  latitude: '',
  longitude: '',
  note: 'Code 1234',
};

interface Wire {
  deliveries: DeliveryAddressPayload[];
  updates: { addressId: string; payload: DeliveryAddressPayload }[];
  billings: BillingAddressPayload[];
  answer: string | null;
}

let wire: Wire;

function boot(
  data: AddressesPanelData,
  carnet: { billing: BillingAddressView | null; deliveries: DeliveryAddressView[] },
): ComponentFixture<AddressesPanel> {
  wire = { deliveries: [], updates: [], billings: [], answer: null };
  const billing = signal(carnet.billing);
  const deliveries = signal<readonly DeliveryAddressView[]>(carnet.deliveries);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AddressesPanel],
    providers: [
      {
        provide: ClientAddresses,
        useValue: {
          billing,
          deliveries,
          addDelivery: (_: string, payload: DeliveryAddressPayload): Promise<string | null> => {
            wire.deliveries.push(payload);
            if (wire.answer === null) {
              deliveries.update((list) => [
                ...list,
                { ...CHALET, id: 'adr_2', label: payload.label },
              ]);
            }
            return Promise.resolve(wire.answer);
          },
          updateDelivery: (
            _: string,
            addressId: string,
            payload: DeliveryAddressPayload,
          ): Promise<string | null> => {
            wire.updates.push({ addressId, payload });
            return Promise.resolve(wire.answer);
          },
          saveBilling: (_: string, payload: BillingAddressPayload): Promise<string | null> => {
            wire.billings.push(payload);
            return Promise.resolve(wire.answer);
          },
        },
      },
      { provide: ServicePoints, useValue: { zoneFor: () => null } },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(AddressesPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('AddressesPanel', () => {
  let fixture: ComponentFixture<AddressesPanel>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const button = (text: string): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll<HTMLButtonElement>('button[foldButton]')).find(
      (b) => (b.textContent ?? '').includes(text),
    );
    if (!found) {
      throw new Error(`Pas de bouton « ${text} ».`);
    }
    return found;
  };

  const typeAddress = (): void => {
    const form = fixture.debugElement.query(By.directive(AddressForm))
      .componentInstance as AddressForm;
    form.value.set(TYPED);
    fixture.detectChanges();
  };

  const save = async (): Promise<void> => {
    button(FR.account.save).click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const BILLING: AddressesPanelData = {
    companyId: 'cmp_1',
    canManage: true,
    view: 'billing',
    form: null,
  };
  const DELIVERY: AddressesPanelData = { ...BILLING, view: 'delivery' };

  it('ouvert sur la facturation, ne montre qu’elle — « Modifier » quand elle est posée', () => {
    fixture = boot(BILLING, { billing: SIEGE, deliveries: [CHALET] });

    expect(el().querySelector('fold-panel-header')?.textContent).toContain(FR.account.billingHead);
    expect(el().textContent).toContain('12 chemin des Barmettes, 73150');
    expect(el().querySelector('.delivery')).toBeNull();
    expect(() => button(FR.account.billingFill)).toThrow();
    expect(() => button(FR.account.billingEdit)).not.toThrow();
  });

  it('ouvert sur les livraisons, ne montre qu’elles, la défaut étiquetée', () => {
    fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET] });

    expect(el().querySelector('fold-panel-header')?.textContent).toContain(FR.account.deliveryHead);
    expect(el().textContent).not.toContain('12 chemin des Barmettes');
    expect(el().querySelector('.delivery')?.textContent).toContain('Chalet');
    expect(el().querySelector('.delivery fold-badge')?.textContent).toContain(
      FR.account.addressDefault,
    );
    expect(() => button(FR.account.addressAdd)).not.toThrow();
  });

  it('ne propose aucune écriture à un rôle qui ne gère pas la société', () => {
    for (const data of [BILLING, DELIVERY]) {
      fixture = boot({ ...data, canManage: false }, { billing: null, deliveries: [] });
      expect(el().querySelectorAll('button[foldButton]').length).toBe(0);
    }
  });

  it('bascule sur le formulaire, poste la livraison, et revient à la liste relue', async () => {
    fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [] });

    button(FR.account.addressAdd).click();
    fixture.detectChanges();
    expect(el().querySelector('lfd-address-form')).not.toBeNull();

    typeAddress();
    await save();

    expect(wire.deliveries).toEqual([
      {
        label: 'Bureau',
        ligne1: '3 place du Village',
        ligne2: '',
        codePostal: '73320',
        ville: 'Tignes',
        pays: 'France',
        // Le carnet était vide : la première adresse devient la défaut.
        isDefault: true,
        specs: {
          signatureRequired: null,
          note: 'Code 1234',
          slots: { mode: 'everyday', slot: null },
          deliveryContact: null,
          gps: null,
        },
      },
    ]);
    expect(el().querySelector('lfd-address-form')).toBeNull();
    expect(el().querySelector('.delivery')?.textContent).toContain('Bureau');
  });

  it('sur un refus, reste sur le formulaire et montre le message du serveur', async () => {
    fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET] });
    button(FR.account.addressAdd).click();
    fixture.detectChanges();
    typeAddress();
    wire.answer = 'Code postal hors de nos zones.';
    await save();

    expect(el().querySelector('lfd-address-form')).not.toBeNull();
    const callout = el().querySelector('fold-callout');
    expect(callout?.textContent).toContain(FR.account.addressSaveFailed);
    expect(callout?.textContent).toContain('Code postal hors de nos zones.');
    expect(wire.deliveries[0]?.isDefault).toBe(false);
  });

  it('ouvert droit au formulaire de facturation, écrit la charge postale seule', async () => {
    fixture = boot(
      { ...BILLING, form: { kind: 'edit', addressId: null } },
      { billing: null, deliveries: [] },
    );
    fixture.detectChanges();

    typeAddress();
    await save();

    expect(wire.billings).toEqual([
      {
        label: 'Bureau',
        ligne1: '3 place du Village',
        ligne2: '',
        codePostal: '73320',
        ville: 'Tignes',
        pays: 'France',
      },
    ]);
  });

  /** Rétabli le 2026-09-14 : « Modifier » sur une livraison, qui manquait au lot. */
  it('« Modifier » une livraison préremplit tout, garde ses consignes, et la PATCHe', async () => {
    const withSpecs: DeliveryAddressView = {
      ...CHALET,
      specs: {
        ...CHALET.specs,
        note: 'Porte bleue',
        slots: { mode: 'everyday', slot: { start: '06:00', end: '08:00' } },
      },
    };
    fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [withSpecs] });

    button(FR.account.edit).click();
    fixture.detectChanges();
    expect(el().querySelector('fold-panel-header')?.textContent).toContain(FR.account.addressEdit);
    const form = fixture.debugElement.query(By.directive(AddressForm))
      .componentInstance as AddressForm;
    expect(form.value().line1).toBe('1 route du Col');

    form.value.set({ ...form.value(), city: 'Tignes' });
    fixture.detectChanges();
    await save();

    expect(wire.updates).toEqual([
      {
        addressId: 'adr_1',
        payload: expect.objectContaining({
          ville: 'Tignes',
          isDefault: true,
          specs: expect.objectContaining({ note: 'Porte bleue', slots: withSpecs.specs.slots }),
        }),
      },
    ]);
    expect(wire.deliveries).toEqual([]);
  });

  it('ouvert par la carte bureau sur une livraison, entre directement dans son formulaire', () => {
    fixture = boot(
      { ...DELIVERY, form: { kind: 'edit', addressId: 'adr_1' } },
      { billing: SIEGE, deliveries: [CHALET] },
    );

    const form = fixture.debugElement.query(By.directive(AddressForm))
      .componentInstance as AddressForm;
    expect(form.value().label).toBe('Chalet');
  });

  it('« Modifier la facturation » la préremplit', () => {
    fixture = boot(BILLING, { billing: SIEGE, deliveries: [] });
    button(FR.account.billingEdit).click();
    fixture.detectChanges();

    const form = fixture.debugElement.query(By.directive(AddressForm))
      .componentInstance as AddressForm;
    expect(form.value().line1).toBe('12 chemin des Barmettes');
  });

  it('Annuler revient à la liste sans rien écrire', () => {
    fixture = boot(BILLING, { billing: null, deliveries: [] });
    button(FR.account.billingFill).click();
    fixture.detectChanges();

    button(FR.account.cancel).click();
    fixture.detectChanges();

    expect(el().querySelector('lfd-address-form')).toBeNull();
    expect(wire.billings).toEqual([]);
  });
});
