import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DeliveryAddressForm, deliveryDraftFrom } from '@lfd/b2b-ui/company';
import type { DeliveryAddressPayload, DeliveryAddressView } from '@lfd/contracts';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { ClientAddresses } from '../../../client-addresses.service';
import { FR } from '../../../copy/fr';
import { matchMediaAt, openedPanel, TOMMEUSES } from '../../account.fixture';
import { DeliveryAddressDialog, type DeliveryAddressDialogData } from './delivery-address-dialog';

/** Une livraison chargée de toutes ses consignes : une correction ne doit rien en perdre. */
const CHALET: DeliveryAddressView = {
  id: 'adr_1',
  label: 'Chalet',
  ligne1: '1 route du Col',
  ligne2: '',
  codePostal: '73150',
  ville: "Val d'Isère",
  pays: 'France',
  isDefault: true,
  procedureStepCount: 0,
  specs: {
    note: 'Porte bleue',
    slots: { mode: 'everyday', slot: { start: '06:00', end: '08:00' } },
    deliveryContact: { prenom: 'Léa', nom: 'Martin', telephone: '06 11 22 33 44' },
    gps: { lat: 45.4486, lng: 6.9806 },
    signatureRequired: true,
  },
};

const HUGO = { prenom: 'Hugo', nom: 'Heynard', telephone: '06 12 44 08 71' };

const CREATE: DeliveryAddressDialogData = {
  companyId: 'cmp_1',
  address: null,
  knownContacts: [HUGO],
  signatureFloor: false,
  firstOfBook: true,
};

interface Wire {
  adds: DeliveryAddressPayload[];
  updates: { addressId: string; payload: DeliveryAddressPayload }[];
  removes: string[];
  answer: string | null;
  closes: unknown[];
  toasts: string[];
}

let wire: Wire;

function boot(data: DeliveryAddressDialogData): ComponentFixture<DeliveryAddressDialog> {
  wire = { adds: [], updates: [], removes: [], answer: null, closes: [], toasts: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DeliveryAddressDialog],
    providers: [
      {
        provide: ClientAddresses,
        useValue: {
          addDelivery: (_: string, payload: DeliveryAddressPayload): Promise<string | null> => {
            wire.adds.push(payload);
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
          removeDelivery: (_: string, addressId: string): Promise<string | null> => {
            wire.removes.push(addressId);
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
  const fixture = TestBed.createComponent(DeliveryAddressDialog);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

const form = (fixture: ComponentFixture<DeliveryAddressDialog>): DeliveryAddressForm =>
  fixture.debugElement.query(By.directive(DeliveryAddressForm))
    .componentInstance as DeliveryAddressForm;

const submitButton = (fixture: ComponentFixture<DeliveryAddressDialog>): HTMLButtonElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.submit');

async function submit(fixture: ComponentFixture<DeliveryAddressDialog>): Promise<void> {
  submitButton(fixture)?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DeliveryAddressDialog', () => {
  it('création : « par défaut » est coché d’office quand le carnet est vide, et seulement alors', () => {
    expect(form(boot(CREATE)).value().isDefault).toBe(true);
    expect(form(boot({ ...CREATE, firstOfBook: false })).value().isDefault).toBe(false);
  });

  it('passe au formulaire partagé le socle, les contacts connus et les libellés de l’écran', () => {
    const fixture = boot(CREATE);
    const shared = form(fixture);

    expect(shared.signatureFloor()).toBe(false);
    expect(shared.knownContacts()).toEqual([HUGO]);
    expect(shared.labels()).toBe(FR.account.deliveryForm);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain(FR.account.deliveryForm.specs.contactLegend);
    expect(text).toContain(FR.account.deliveryForm.defaultLabel);
  });

  it('n’envoie rien tant que le formulaire est incomplet', () => {
    const fixture = boot(CREATE);
    expect(submitButton(fixture)?.disabled).toBe(true);
  });

  it('création : envoie le payload COMPLET — postal, rang et consignes — toaste et ferme', async () => {
    const fixture = boot(CREATE);
    form(fixture).value.set(deliveryDraftFrom({ ...CHALET, id: '' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('fold-panel-header')?.textContent).toContain(
      FR.account.addressAdd,
    );
    await submit(fixture);

    expect(wire.adds).toEqual([
      {
        label: 'Chalet',
        ligne1: '1 route du Col',
        ligne2: '',
        codePostal: '73150',
        ville: "Val d'Isère",
        pays: 'France',
        isDefault: true,
        specs: CHALET.specs,
      },
    ]);
    expect(wire.updates).toEqual([]);
    expect(wire.toasts).toEqual([FR.account.addressSavedToast]);
    expect(wire.closes).toEqual([true]);
  });

  it('correction : préremplie en entier, elle rend créneaux, contact, GPS et signature intacts', async () => {
    const fixture = boot({ ...CREATE, address: CHALET, firstOfBook: false });
    expect(form(fixture).value()).toEqual(deliveryDraftFrom(CHALET));

    const draft = form(fixture).value();
    form(fixture).value.set({ ...draft, ville: 'Tignes' });
    fixture.detectChanges();
    await submit(fixture);

    expect(wire.adds).toEqual([]);
    expect(wire.updates).toEqual([
      {
        addressId: 'adr_1',
        payload: expect.objectContaining({ ville: 'Tignes', isDefault: true, specs: CHALET.specs }),
      },
    ]);
  });

  it('un refus du serveur s’affiche dans le dialogue, qui reste ouvert', async () => {
    const fixture = boot({ ...CREATE, address: CHALET });
    form(fixture).value.set({ ...form(fixture).value(), ville: 'Tignes' });
    fixture.detectChanges();
    wire.answer = 'Code postal hors de nos zones.';
    await submit(fixture);

    const alert = (fixture.nativeElement as HTMLElement).querySelector('fold-callout');
    expect(alert?.textContent).toContain(FR.account.addressSaveFailed);
    expect(alert?.textContent).toContain('Code postal hors de nos zones.');
    expect(wire.closes).toEqual([]);
    expect(wire.toasts).toEqual([]);
  });

  /** Règle « Saisir » : rien de changé, rien à envoyer — même sur une adresse complète. */
  it('correction : Enregistrer reste désarmé tant que rien n’a changé', () => {
    const fixture = boot({ ...CREATE, address: CHALET, firstOfBook: false });
    expect(submitButton(fixture)?.disabled).toBe(true);

    form(fixture).value.set({ ...form(fixture).value(), ville: 'Tignes' });
    fixture.detectChanges();
    expect(submitButton(fixture)?.disabled).toBe(false);

    form(fixture).value.set(deliveryDraftFrom(CHALET));
    fixture.detectChanges();
    expect(submitButton(fixture)?.disabled).toBe(true);
  });

  describe('la zone de danger', () => {
    const host = (fixture: ComponentFixture<DeliveryAddressDialog>): HTMLElement =>
      fixture.nativeElement as HTMLElement;

    const confirmRemoval = async (
      fixture: ComponentFixture<DeliveryAddressDialog>,
    ): Promise<void> => {
      const zone = host(fixture).querySelector('fold-danger-zone');
      Array.from(zone?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        .find((b) => b.textContent?.trim() === FR.account.addressRemove)
        ?.click();
      fixture.detectChanges();
      const confirm = Array.from(zone?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
        (b) => b.textContent?.trim() === FR.account.addressRemoveConfirm,
      );
      expect(confirm).toBeDefined();
      confirm?.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('n’existe pas à la création : il n’y a rien à supprimer', () => {
      expect(host(boot(CREATE)).querySelector('fold-danger-zone')).toBeNull();
    });

    it('en correction, archive CETTE adresse, toaste et ferme', async () => {
      const fixture = boot({ ...CREATE, address: CHALET, firstOfBook: false });
      expect(host(fixture).querySelector('fold-danger-zone')?.textContent).toContain(
        FR.account.addressRemoveMessage,
      );

      await confirmRemoval(fixture);

      expect(wire.removes).toEqual(['adr_1']);
      expect(wire.updates).toEqual([]);
      expect(wire.toasts).toEqual([FR.account.addressRemovedToast]);
      expect(wire.closes).toEqual([true]);
    });

    it('sur un refus, reste ouvert et le montre', async () => {
      const fixture = boot({ ...CREATE, address: CHALET, firstOfBook: false });
      wire.answer = 'Adresse de livraison introuvable.';

      await confirmRemoval(fixture);

      expect(wire.closes).toEqual([]);
      expect(wire.toasts).toEqual([]);
      const alert = host(fixture).querySelector('fold-callout[variant="alert"]');
      expect(alert?.textContent).toContain(FR.account.addressActionFailed);
      expect(alert?.textContent).toContain('Adresse de livraison introuvable.');
    });
  });

  describe('ouverture', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
    });

    afterEach(() => {
      TestBed.inject(FoldPanelHostService).dismissAll();
    });

    it('en feuille du bas sous le pli, avec le socle et le contact principal de la société', () => {
      vi.stubGlobal('matchMedia', matchMediaAt(true));
      DeliveryAddressDialog.open(TestBed.inject(FoldPanelHostService), TOMMEUSES, null, true);

      expect(openedPanel()).toEqual({
        component: DeliveryAddressDialog,
        side: 'bottom',
        data: {
          companyId: 'cmp_1',
          address: null,
          knownContacts: [HUGO],
          signatureFloor: TOMMEUSES.fulfillmentPreference.signatureRequired,
          firstOfBook: true,
        },
      });
    });

    it('en dialogue centré au-delà du pli, sur une largeur `lg`', () => {
      vi.stubGlobal('matchMedia', matchMediaAt(false));
      const host = TestBed.inject(FoldPanelHostService);
      DeliveryAddressDialog.open(host, TOMMEUSES, CHALET, false);

      expect(openedPanel()?.side).toBe('center');
      expect(host.panels()[0]?.width()).toBe(640);
    });

    it('sans nom au contact principal, ne propose aucun contact connu', () => {
      vi.stubGlobal('matchMedia', matchMediaAt(false));
      const anonymous = {
        ...TOMMEUSES,
        primaryContact: { ...TOMMEUSES.primaryContact, firstName: '', lastName: '' },
      };
      DeliveryAddressDialog.open(TestBed.inject(FoldPanelHostService), anonymous, null, true);

      expect(openedPanel()?.data).toMatchObject({ knownContacts: [] });
    });
  });
});
