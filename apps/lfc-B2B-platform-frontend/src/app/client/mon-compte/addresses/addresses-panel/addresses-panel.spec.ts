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
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { ClientAddresses } from '../../../client-addresses.service';
import { FR } from '../../../copy/fr';
import { ServicePoints } from '../../../shop/pickup-points.store';
import { accountWith, matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
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

  it('ouvert droit au formulaire de facturation, écrit la charge postale seule', async () => {
    fixture = boot({ ...BILLING, form: { kind: 'edit' } }, { billing: null, deliveries: [] });
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

  it('« Modifier » une livraison ouvre son dialogue sur CETTE adresse, consignes comprises', () => {
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

    button(FR.account.edit).click();
    expect(openedPanel()?.component).toBe(DeliveryAddressDialog);
    expect(openedPanel()?.side).toBe('bottom');
    expect(openedPanel()?.data).toMatchObject({ address: withSpecs, firstOfBook: false });
    expect(wire.updates).toEqual([]);
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

  describe('les gestes de ligne — Supprimer, Définir par défaut', () => {
    /** La ligne dont le libellé est `label`. */
    const row = (label: string): HTMLElement => {
      const found = Array.from(el().querySelectorAll<HTMLElement>('.delivery')).find(
        (node) => node.querySelector('.delivery-label')?.textContent?.trim() === label,
      );
      if (!found) {
        throw new Error(`Pas de ligne « ${label} ».`);
      }
      return found;
    };

    /** Le bouton de cette ligne dont le texte est EXACTEMENT `text`. */
    const rowButton = (label: string, text: string): HTMLButtonElement | undefined =>
      Array.from(row(label).querySelectorAll<HTMLButtonElement>('button[foldButton]')).find(
        (b) => b.textContent?.trim() === text,
      );

    const labels = (): string[] =>
      Array.from(el().querySelectorAll('.delivery-label')).map((n) => n.textContent?.trim() ?? '');

    const settle = async (): Promise<void> => {
      await fixture.whenStable();
      fixture.detectChanges();
    };

    /** Ouvre la confirmation en place de cette ligne, et la rend. */
    const askRemove = (label: string): HTMLElement => {
      rowButton(label, FR.account.addressRemove)?.click();
      fixture.detectChanges();
      const group = row(label).querySelector<HTMLElement>('fold-inline-confirm [role="group"]');
      if (!group) {
        throw new Error(`Pas de confirmation sur « ${label} ».`);
      }
      return group;
    };

    const groupButton = (group: HTMLElement, text: string): HTMLButtonElement | undefined =>
      Array.from(group.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === text,
      );

    it('n’offre « Définir par défaut » qu’aux livraisons qui ne le sont pas déjà', () => {
      fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET, BUREAU] });

      expect(rowButton('Chalet', FR.account.addressMakeDefault)).toBeUndefined();
      expect(rowButton('Bureau', FR.account.addressMakeDefault)).toBeDefined();
      expect(rowButton('Chalet', FR.account.addressRemove)).toBeDefined();
      expect(rowButton('Bureau', FR.account.addressRemove)).toBeDefined();
    });

    it('aux rôles qui ne gèrent pas la société : ni suppression ni défaut, même devant des livraisons', () => {
      fixture = boot(
        { ...DELIVERY, canManage: false },
        { billing: SIEGE, deliveries: [CHALET, BUREAU] },
      );

      expect(labels()).toEqual(['Chalet', 'Bureau']);
      expect(el().querySelectorAll('fold-inline-confirm').length).toBe(0);
      expect(el().querySelectorAll('button[foldButton]').length).toBe(0);
    });

    it('« Définir par défaut » vise CETTE adresse, toaste, et la liste relue la remonte en tête', async () => {
      fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET, BUREAU] });

      rowButton('Bureau', FR.account.addressMakeDefault)?.click();
      await settle();

      expect(wire.defaults).toEqual(['cmp_1/adr_2']);
      expect(wire.removes).toEqual([]);
      expect(wire.toasts).toEqual([FR.account.addressDefaultToast]);
      expect(labels()).toEqual(['Bureau', 'Chalet']);
      expect(row('Bureau').querySelector('fold-badge')?.textContent).toContain(
        FR.account.addressDefault,
      );
      expect(rowButton('Chalet', FR.account.addressMakeDefault)).toBeDefined();
      expect(rowButton('Bureau', FR.account.addressMakeDefault)).toBeUndefined();
    });

    it('« Supprimer » demande confirmation EN PLACE, en français, sans rien appeler', () => {
      fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET, BUREAU] });

      const group = askRemove('Bureau');

      expect(wire.removes).toEqual([]);
      expect(group.getAttribute('aria-label')).toBe(FR.account.addressRemoveGroup);
      expect(group.textContent).toContain(FR.account.addressRemoveMessage);
      expect(groupButton(group, FR.account.addressRemoveConfirm)).toBeDefined();
      expect(groupButton(group, FR.account.cancel)).toBeDefined();
      // L'autre ligne ne bouge pas.
      expect(row('Chalet').querySelector('[role="group"]')).toBeNull();
    });

    it('Annuler la confirmation n’appelle rien, ne toaste rien, et rend le bouton', () => {
      fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET, BUREAU] });

      groupButton(askRemove('Bureau'), FR.account.cancel)?.click();
      fixture.detectChanges();

      expect(wire.removes).toEqual([]);
      expect(wire.toasts).toEqual([]);
      expect(row('Bureau').querySelector('[role="group"]')).toBeNull();
      expect(rowButton('Bureau', FR.account.addressRemove)).toBeDefined();
      expect(labels()).toEqual(['Chalet', 'Bureau']);
    });

    it('confirmer archive CETTE adresse, toaste, et la liste relue ne la montre plus', async () => {
      fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET, BUREAU] });

      groupButton(askRemove('Bureau'), FR.account.addressRemoveConfirm)?.click();
      await settle();

      expect(wire.removes).toEqual(['cmp_1/adr_2']);
      expect(wire.defaults).toEqual([]);
      expect(wire.toasts).toEqual([FR.account.addressRemovedToast]);
      expect(labels()).toEqual(['Chalet']);
      // Et le décompte s'accorde : c'était « 1 adresses ».
      expect(el().querySelector('.head')?.textContent?.trim()).toBe('1 adresse');
      expect(el().querySelector('fold-callout')).toBeNull();
    });

    it('un refus s’affiche en tête de la liste, qui reste à l’écran, sans toast de succès', async () => {
      fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET, BUREAU] });
      wire.answer = 'Adresse de livraison introuvable.';

      groupButton(askRemove('Chalet'), FR.account.addressRemoveConfirm)?.click();
      await settle();

      const callout = el().querySelector('fold-callout');
      expect(callout?.textContent).toContain(FR.account.addressActionFailed);
      expect(callout?.textContent).toContain('Adresse de livraison introuvable.');
      expect(labels()).toEqual(['Chalet', 'Bureau']);
      expect(wire.toasts).toEqual([]);
      expect(rowButton('Chalet', FR.account.addressRemove)?.disabled).toBe(false);
    });

    it('le refus précédent s’efface au geste suivant', async () => {
      fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET, BUREAU] });
      wire.answer = 'Refus.';
      rowButton('Bureau', FR.account.addressMakeDefault)?.click();
      await settle();
      expect(el().querySelector('fold-callout')).not.toBeNull();

      wire.answer = null;
      rowButton('Bureau', FR.account.addressMakeDefault)?.click();
      await settle();

      expect(el().querySelector('fold-callout')).toBeNull();
      expect(wire.defaults).toEqual(['cmp_1/adr_2', 'cmp_1/adr_2']);
    });

    /** Deux actions en parallèle : la relecture de l'une écraserait l'autre. */
    it('une action en vol désarme tous les gestes de ligne, et un second clic ne part pas', async () => {
      fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET, BUREAU] });
      let release: () => void = () => undefined;
      wire.gate = new Promise<void>((resolve) => (release = resolve));

      const makeDefault = rowButton('Bureau', FR.account.addressMakeDefault);
      makeDefault?.click();
      fixture.detectChanges();

      expect(rowButton('Chalet', FR.account.edit)?.disabled).toBe(true);
      expect(rowButton('Chalet', FR.account.addressRemove)?.disabled).toBe(true);
      expect(rowButton('Bureau', FR.account.addressRemove)?.disabled).toBe(true);
      makeDefault?.click();
      expect(wire.defaults).toEqual(['cmp_1/adr_2']);

      release();
      // `whenStable` ne suit pas une promesse retenue à la main : on vide les microtâches.
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
      }
      fixture.detectChanges();
      expect(rowButton('Chalet', FR.account.addressRemove)?.disabled).toBe(false);
      expect(wire.defaults).toEqual(['cmp_1/adr_2']);
    });

    it('accorde le décompte : « 2 adresses », puis « 1 adresse »', () => {
      fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET, BUREAU] });
      expect(el().querySelector('.head')?.textContent?.trim()).toBe('2 adresses');

      fixture = boot(DELIVERY, { billing: SIEGE, deliveries: [CHALET] });
      expect(el().querySelector('.head')?.textContent?.trim()).toBe('1 adresse');
    });
  });
});
