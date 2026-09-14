import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  BillingAddressPayload,
  BillingAddressView,
  DeliveryAddressPayload,
  DeliveryAddressView,
} from '@lfd/contracts';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { ClientAddresses } from '../../../client-addresses.service';
import { FR } from '../../../copy/fr';
import { ServicePoints } from '../../../shop/pickup-points.store';
import { accountWith, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { BillingAddressDialog } from '../billing-address-dialog/billing-address-dialog';
import { DeliveryAddressDialog } from '../delivery-address-dialog/delivery-address-dialog';
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

/** Une seconde livraison, qui n'est PAS la défaut. */
const BUREAU: DeliveryAddressView = { ...CHALET, id: 'adr_2', label: 'Bureau', isDefault: false };

interface Wire {
  deliveries: DeliveryAddressPayload[];
  updates: { addressId: string; payload: DeliveryAddressPayload }[];
  billings: BillingAddressPayload[];
  /** `société/adresse` de chaque archivage et de chaque désignation de défaut. */
  removes: string[];
  defaults: string[];
  toasts: string[];
  answer: string | null;
  /** Posé, retient la réponse des actions de ligne jusqu'à ce qu'on le libère. */
  gate: Promise<void> | null;
}

let wire: Wire;

function boot(
  data: AddressesPanelData,
  carnet: { billing: BillingAddressView | null; deliveries: DeliveryAddressView[] },
): ComponentFixture<AddressesPanel> {
  wire = {
    deliveries: [],
    updates: [],
    billings: [],
    removes: [],
    defaults: [],
    toasts: [],
    answer: null,
    gate: null,
  };
  const billing = signal(carnet.billing);
  const deliveries = signal<readonly DeliveryAddressView[]>(carnet.deliveries);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AddressesPanel],
    providers: [
      accountWith([TOMMEUSES]),
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
            // La relecture du vrai service, rejouée : la ligne posée revient.
            if (wire.answer === null) {
              billing.set({ id: 'adr_siege', ...payload });
            }
            return Promise.resolve(wire.answer);
          },
          // La relecture du vrai service, rejouée : l'archivée disparaît, la
          // défaut remonte en tête.
          removeDelivery: async (companyId: string, addressId: string): Promise<string | null> => {
            wire.removes.push(`${companyId}/${addressId}`);
            await wire.gate;
            if (wire.answer === null) {
              deliveries.update((list) => list.filter((a) => a.id !== addressId));
            }
            return wire.answer;
          },
          makeDefaultDelivery: async (
            companyId: string,
            addressId: string,
          ): Promise<string | null> => {
            wire.defaults.push(`${companyId}/${addressId}`);
            await wire.gate;
            if (wire.answer === null) {
              deliveries.update((list) =>
                list
                  .map((a) => ({ ...a, isDefault: a.id === addressId }))
                  .sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
              );
            }
            return wire.answer;
          },
        },
      },
      { provide: ServicePoints, useValue: { zoneFor: () => null } },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string) => wire.toasts.push(message),
          error: () => undefined,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AddressesPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

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

  const BILLING: AddressesPanelData = {
    companyId: 'cmp_1',
    canManage: true,
    view: 'billing',
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

  /**
   * Depuis le 2026-09-14, une livraison s'édite dans son DIALOGUE, empilé sur la
   * liste. Au succès, la liste montrée est celle que l'écriture a relue.
   */
  it('« Ajouter » ouvre le dialogue, coché par défaut sur un carnet vide ; au succès, la liste relue le montre', async () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [] });

    button(FR.account.addressAdd).click();
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
    // Le panneau ne bascule plus sur un formulaire postal : la liste reste dessous.
    expect(el().querySelector('lfd-address-form')).toBeNull();

    // Le dialogue écrit (le carnet partagé est relu), puis se ferme sur un succès.
    await TestBed.inject(ClientAddresses).addDelivery('cmp_1', {
      label: 'Bureau',
      ligne1: '3 place du Village',
      ligne2: '',
      codePostal: '73320',
      ville: 'Tignes',
      pays: 'France',
      isDefault: true,
      specs: CHALET.specs,
    });
    const [dialog] = TestBed.inject(FoldPanelHostService).panels();
    if (dialog?.kind !== 'component') {
      throw new Error('Le dialogue ne s’est pas ouvert.');
    }
    dialog.injector.get(FoldPanelRef).close(true);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('.delivery')?.textContent).toContain('Bureau');
  });

  /** Plus de boutons de ligne (règle « Saisir », 2026-09-14) : la ligne elle-même ouvre le dialogue. */
  it('un clic sur une livraison ouvre son dialogue sur CETTE adresse, consignes comprises', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const withSpecs: DeliveryAddressView = {
      ...CHALET,
      specs: {
        ...CHALET.specs,
        note: 'Porte bleue',
        slots: { mode: 'everyday', slot: { start: '06:00', end: '08:00' } },
      },
    };
    fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [withSpecs] });

    el().querySelector<HTMLButtonElement>('button.delivery')?.click();
    expect(openedPanel()?.component).toBe(DeliveryAddressDialog);
    expect(openedPanel()?.side).toBe('bottom');
    expect(openedPanel()?.data).toMatchObject({ address: withSpecs, firstOfBook: false });
    expect(wire.updates).toEqual([]);
  });

  /** Depuis le 2026-09-14, la facturation a son dialogue, empilé : le panneau ne garde que la liste. */
  it('« Renseigner la facturation » ouvre son dialogue ; au succès, la ligne relue s’affiche', async () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    fixture = boot(BILLING, { billing: null, deliveries: [] });
    expect(el().querySelector('lfd-address-form')).toBeNull();

    button(FR.account.billingFill).click();
    expect(openedPanel()).toEqual({
      component: BillingAddressDialog,
      side: 'center',
      data: { companyId: 'cmp_1', billing: null },
    });

    // Le dialogue écrit (le carnet partagé est relu), puis se ferme sur un succès.
    await TestBed.inject(ClientAddresses).saveBilling('cmp_1', {
      label: 'Siège',
      ligne1: '12 chemin des Barmettes',
      ligne2: '',
      codePostal: '73150',
      ville: "Val d'Isère",
      pays: 'France',
    });
    const [dialog] = TestBed.inject(FoldPanelHostService).panels();
    if (dialog?.kind !== 'component') {
      throw new Error('Le dialogue ne s’est pas ouvert.');
    }
    dialog.injector.get(FoldPanelRef).close(true);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('.line')?.textContent).toContain(
      "12 chemin des Barmettes, 73150 Val d'Isère",
    );
    expect(button(FR.account.billingEdit)).toBeTruthy();
  });

  it('« Modifier la facturation » ouvre son dialogue sur la facturation posée, en feuille sous le pli', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    fixture = boot(BILLING, { billing: SIEGE, deliveries: [] });

    button(FR.account.billingEdit).click();
    expect(openedPanel()?.component).toBe(BillingAddressDialog);
    expect(openedPanel()?.side).toBe('bottom');
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', billing: SIEGE });
    expect(wire.billings).toEqual([]);
  });

  it('la ligne se lit : ni « Définir par défaut », ni « Modifier », ni « Supprimer »', () => {
    fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET, BUREAU] });

    const rows = Array.from(el().querySelectorAll<HTMLElement>('.delivery'));
    expect(rows.map((r) => r.querySelector('.delivery-label')?.textContent?.trim())).toEqual([
      'Chalet',
      'Bureau',
    ]);
    expect(el().querySelectorAll('.delivery button, .delivery fold-inline-confirm').length).toBe(0);
    expect(el().textContent).not.toContain(FR.account.addressRemove);
    // Le seul geste du carnet : ajouter.
    expect(
      Array.from(el().querySelectorAll('button[foldButton]')).map((b) => b.textContent?.trim()),
    ).toEqual([FR.account.addressAdd]);
  });

  it('aux rôles qui ne gèrent pas, une ligne ne s’ouvre pas', () => {
    fixture = boot(
      { ...DELIVERY, canManage: false },
      { billing: SIEGE, deliveries: [CHALET, BUREAU] },
    );
    expect(el().querySelectorAll('button.delivery').length).toBe(0);
    expect(el().querySelectorAll('div.delivery').length).toBe(2);
  });

  it('accorde le décompte : « 2 adresses », puis « 1 adresse »', () => {
    fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET, BUREAU] });
    expect(el().querySelector('.head')?.textContent?.trim()).toBe('2 adresses');

    fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET] });
    expect(el().querySelector('.head')?.textContent?.trim()).toBe('1 adresse');
  });
});
