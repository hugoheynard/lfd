import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { DeliveryAddressView, FulfillmentPreferenceView } from '@lfd/contracts';
import { FoldListboxComponent, FoldPanelRef } from 'fold-ng';

import { AccountService } from '../../../../account/account.service';
import { ClientAddresses } from '../../../client-addresses.service';
import { ClientLocale } from '../../../client-locale.service';
import { ClientPreferences } from '../../../client-preferences.service';
import { EN } from '../../../copy/en';
import { FR } from '../../../copy/fr';
import { ServicePoints } from '../../../shop/pickup-points.store';
import { PreferencesPanel, type PreferencesPanelData } from './preferences-panel';

/** Les deux points de retrait de la plateforme — seuls les champs que le panneau lit. */
const LABO = { id: 'pk_1', label: 'Le Labo', isDefault: true };
const BASTILLE = { id: 'pk_2', label: 'Bastille', isDefault: false };

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
const BUREAU: DeliveryAddressView = { ...CHALET, id: 'adr_2', label: 'Bureau', isDefault: false };

/**
 * Rien de posé, SAUF le socle de signature : le panneau ne le montre pas, il
 * doit donc repartir tel quel dans chaque écriture.
 */
const NONE: FulfillmentPreferenceView = {
  method: null,
  pickupAddressId: null,
  deliveryAddressId: null,
  signatureRequired: true,
};
const AT_BASTILLE: FulfillmentPreferenceView = {
  ...NONE,
  method: 'pickup',
  pickupAddressId: 'pk_2',
};

const OWNER: PreferencesPanelData = { companyId: 'cmp_1', canManage: true, preference: NONE };

interface Wire {
  saves: { companyId: string; preference: FulfillmentPreferenceView }[];
  answer: string | null;
  closes: unknown[];
  hydrated: number;
}

let wire: Wire;

function boot(data: PreferencesPanelData): ComponentFixture<PreferencesPanel> {
  wire = { saves: [], answer: null, closes: [], hydrated: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PreferencesPanel],
    providers: [
      {
        provide: AccountService,
        useValue: {
          saveFulfillment: (
            companyId: string,
            preference: FulfillmentPreferenceView,
          ): Promise<string | null> => {
            wire.saves.push({ companyId, preference });
            return Promise.resolve(wire.answer);
          },
        },
      },
      { provide: ClientAddresses, useValue: { deliveries: signal([CHALET, BUREAU]) } },
      {
        provide: ServicePoints,
        useValue: {
          pickups: signal([LABO, BASTILLE]),
          hydrate: (): Promise<void> => {
            wire.hydrated += 1;
            return Promise.resolve();
          },
        },
      },
      {
        provide: ClientPreferences,
        useValue: { habit: signal('Retrait au Labo'), language: signal('Français') },
      },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef(1, (result) => wire.closes.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(PreferencesPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('PreferencesPanel', () => {
  let fixture: ComponentFixture<PreferencesPanel>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const listboxes = (): FoldListboxComponent<string>[] =>
    fixture.debugElement
      .queryAll(By.directive(FoldListboxComponent))
      .map((node) => node.componentInstance as FoldListboxComponent<string>);

  const listbox = (index: number): FoldListboxComponent<string> => {
    const found = listboxes()[index];
    if (!found) {
      throw new Error(`Pas de liste n° ${index}.`);
    }
    return found;
  };

  const options = (index: number): { value: string; label: string }[] =>
    (listbox(index).options() ?? []).map((o) => ({
      value: 'value' in o ? o.value : '',
      label: o.label,
    }));

  /** Ce que fait un choix à la souris : `selectionChange`, valeur déjà typée. */
  const pick = (index: number, value: string): void => {
    listbox(index).selectionChange.emit(value);
    fixture.detectChanges();
  };

  const button = (text: string): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll<HTMLButtonElement>('button[foldButton]')).find(
      (b) => (b.textContent ?? '').includes(text),
    );
    if (!found) {
      throw new Error(`Pas de bouton « ${text} ».`);
    }
    return found;
  };

  const save = async (): Promise<void> => {
    button(FR.account.save).click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('préremplit le mode et la destination posés', () => {
    fixture = boot({ ...OWNER, preference: AT_BASTILLE });

    expect(listboxes().length).toBe(2);
    expect(listbox(0).label()).toBe(FR.account.prefMethod);
    expect(listbox(0).value()).toBe('pickup');
    expect(listbox(1).label()).toBe(FR.account.prefPickupPoint);
    expect(listbox(1).value()).toBe('pk_2');
  });

  it('propose aucun, retrait et livraison — libellés visibles', () => {
    fixture = boot(OWNER);

    expect(options(0)).toEqual([
      { value: 'none', label: FR.account.prefMethodNone },
      { value: 'pickup', label: FR.account.prefMethodPickup },
      { value: 'delivery', label: FR.account.prefMethodDelivery },
    ]);
  });

  it('sans mode posé : « aucun », pas de destination, et rien à enregistrer', () => {
    fixture = boot(OWNER);

    expect(listboxes().length).toBe(1);
    expect(listbox(0).value()).toBe('none');
    expect(button(FR.account.save).disabled).toBe(true);
  });

  /** « Par défaut » est un choix à part entière, en tête : il suit le défaut du moment. */
  it('les points de retrait : « par défaut » en tête, puis les points, le défaut du jour étiqueté', () => {
    fixture = boot(OWNER);
    pick(0, 'pickup');

    expect(listbox(1).label()).toBe(FR.account.prefPickupPoint);
    expect(options(1)).toEqual([
      { value: '', label: FR.account.prefPickupDefault },
      { value: 'pk_1', label: `Le Labo (${FR.account.prefDefaultTag})` },
      { value: 'pk_2', label: 'Bastille' },
    ]);
    expect(listbox(1).value()).toBe('');
  });

  it('la livraison : les adresses de la société, la défaut étiquetée', () => {
    fixture = boot(OWNER);
    pick(0, 'delivery');

    expect(listbox(1).label()).toBe(FR.account.prefDeliveryAddress);
    expect(options(1)).toEqual([
      { value: '', label: FR.account.prefDeliveryDefault },
      { value: 'adr_1', label: `Chalet (${FR.account.prefDefaultTag})` },
      { value: 'adr_2', label: 'Bureau' },
    ]);
  });

  it('choisir un mode part du défaut, et le socle de signature repart tel quel', async () => {
    fixture = boot(OWNER);
    pick(0, 'pickup');
    await save();

    expect(wire.saves).toEqual([
      {
        companyId: 'cmp_1',
        preference: {
          method: 'pickup',
          pickupAddressId: null,
          deliveryAddressId: null,
          signatureRequired: true,
        },
      },
    ]);
  });

  it('une destination nommée part par son identifiant, l’autre pointeur reste nul', async () => {
    fixture = boot(OWNER);
    pick(0, 'delivery');
    pick(1, 'adr_2');
    await save();

    expect(wire.saves[0]?.preference).toEqual({
      method: 'delivery',
      pickupAddressId: null,
      deliveryAddressId: 'adr_2',
      signatureRequired: true,
    });
  });

  /** Une adresse de livraison ne désigne pas un point de retrait : elle ne survit pas au changement. */
  it('changer de mode remet la destination au défaut', async () => {
    fixture = boot({ ...OWNER, preference: AT_BASTILLE });
    pick(0, 'delivery');

    expect(listbox(1).value()).toBe('');
    await save();
    expect(wire.saves[0]?.preference).toEqual({
      method: 'delivery',
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: true,
    });
  });

  it('« aucun » retire l’habitude sans toucher au socle de signature', async () => {
    fixture = boot({
      ...OWNER,
      preference: { ...NONE, method: 'delivery', deliveryAddressId: 'adr_2' },
    });
    pick(0, 'none');

    expect(listboxes().length).toBe(1);
    await save();
    expect(wire.saves[0]?.preference).toEqual(NONE);
  });

  it('revenir à ce qui est posé désarme Enregistrer ; rechoisir le même mode garde la destination', () => {
    fixture = boot({ ...OWNER, preference: AT_BASTILLE });

    pick(1, 'pk_1');
    expect(button(FR.account.save).disabled).toBe(false);
    pick(1, 'pk_2');
    expect(button(FR.account.save).disabled).toBe(true);

    pick(0, 'pickup');
    expect(listbox(1).value()).toBe('pk_2');
    expect(button(FR.account.save).disabled).toBe(true);
  });

  it('se ferme avec `true` quand l’écriture aboutit', async () => {
    fixture = boot(OWNER);
    pick(0, 'pickup');
    await save();

    expect(wire.closes).toEqual([true]);
  });

  it('sur un refus, reste ouvert, se réarme et montre le message du serveur', async () => {
    fixture = boot(OWNER);
    wire.answer = 'Adresse de livraison introuvable.';
    pick(0, 'delivery');
    pick(1, 'adr_2');
    await save();

    expect(wire.closes).toEqual([]);
    expect(button(FR.account.save).disabled).toBe(false);
    const callout = el().querySelector('fold-callout');
    expect(callout?.textContent).toContain(FR.account.prefSaveFailed);
    expect(callout?.textContent).toContain('Adresse de livraison introuvable.');
    // Le choix reste sous les yeux, à corriger.
    expect(listbox(1).value()).toBe('adr_2');
  });

  it('Annuler ferme sans rien écrire', () => {
    fixture = boot(OWNER);
    pick(0, 'pickup');

    button(FR.account.cancel).click();

    expect(wire.saves).toEqual([]);
    expect(wire.closes).toEqual([undefined]);
  });

  /** L'API refuse l'habitude aux autres rôles : ils la lisent, ils règlent la langue. */
  it('en lecture : l’habitude se lit, ni liste ni pied — la langue se règle quand même', () => {
    fixture = boot({ ...OWNER, canManage: false });

    expect(listboxes().length).toBe(0);
    expect(el().querySelector('fold-panel-footer')).toBeNull();
    expect(el().querySelector('.facts')?.textContent).toContain('Retrait au Labo');
    expect(el().querySelector('app-lang-switch')).not.toBeNull();
    expect(el().textContent).toContain(FR.account.prefNote);
  });

  it('sans société, rien ne peut partir', async () => {
    fixture = boot({ companyId: null, canManage: true, preference: NONE });
    pick(0, 'pickup');

    expect(button(FR.account.save).disabled).toBe(true);
    await save();
    expect(wire.saves).toEqual([]);
  });

  /** La langue n'est pas un réglage de société : aucun appel, et l'écran change tout de suite. */
  it('la langue bascule tout de suite, sans rien enregistrer', () => {
    fixture = boot(OWNER);
    const english = Array.from(
      el().querySelectorAll<HTMLButtonElement>('app-lang-switch button'),
    ).find((b) => b.textContent?.trim() === 'EN');

    english?.click();
    fixture.detectChanges();

    expect(TestBed.inject(ClientLocale).current()).toBe('en');
    expect(el().querySelector('fold-panel-header')?.textContent).toContain(
      EN.account.sections.preferences,
    );
    expect(wire.saves).toEqual([]);
    expect(wire.closes).toEqual([]);
  });

  it('demande les points de retrait à l’ouverture — `/mon-compte` ne les lit pas', () => {
    fixture = boot(OWNER);

    expect(wire.hydrated).toBe(1);
  });
});
