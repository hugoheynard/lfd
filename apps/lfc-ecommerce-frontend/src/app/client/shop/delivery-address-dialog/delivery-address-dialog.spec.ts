import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DeliveryAddressView, DeliverySpecs, DeliveryZoneView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ClientAddresses } from '../../client-addresses.service';
import type { ServiceChoice } from '../../order-context.store';
import { ServicePoints } from '../pickup-points.store';
import { DeliveryAddressDialog } from './delivery-address-dialog';
import { ShopCopyOverrides } from '../../copy/shop-copy-overrides';

/** Une zone à 6,90 € — un MONTANT, la forme la plus simple à assurer. */
const ZONE: DeliveryZoneView = {
  id: 'z1',
  label: 'Val d’Isère',
  postalPrefixes: ['73150'],
  fee: { mode: 'amount', cents: 690 },
};

function address(over: Partial<DeliveryAddressView> & { id: string }): DeliveryAddressView {
  return {
    label: 'Chalet',
    ligne1: '12 chemin des Barmettes',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
    isDefault: false,
    specs: {
      note: '',
      slotList: { mode: 'everyday', slots: [] },
      deliveryContact: null,
      gps: null,
      signatureRequired: null,
    },
    ...over,
  } as DeliveryAddressView;
}

/** Un carnet qui déclare un créneau tous les jours : le serveur le lira. */
const SLOTTED: DeliverySpecs = {
  note: '',
  slotList: { mode: 'everyday', slots: [{ start: '09:00', end: '11:00' }] },
  deliveryContact: null,
  gps: null,
  signatureRequired: null,
};

/** Une adresse en échéance, qui en inscrit deux tous les jours. */
const TWO_DEADLINES: DeliverySpecs = {
  ...SLOTTED,
  windowMode: 'deadline',
  deadlines: { mode: 'everyday', times: ['06:00', '11:00'] },
};

function boot(
  book: readonly DeliveryAddressView[],
  currentId: string | null = null,
  windowMode: 'slot' | 'deadline' = 'slot',
  allowFreeEntry = false,
  currentDate: string | null = null,
) {
  const closed: (ServiceChoice | undefined)[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DeliveryAddressDialog],
    providers: [
      { provide: ClientAddresses, useValue: { deliveries: signal(book) } },
      {
        provide: ServicePoints,
        useValue: {
          hydrate: (): Promise<void> => Promise.resolve(),
          // Une seule zone servie : tout ce qui n'est pas en 73150 est dehors.
          zoneFor: (code: string): DeliveryZoneView | null => (code === '73150' ? ZONE : null),
          nextDayFor: (): string | null => '2026-09-21',
          lastDay: signal<string | null>(null),
          deliveryAvailability: signal({ openToB2b: true, openToB2c: true, windowMode }),
        },
      },
      {
        provide: FoldPanelRef,
        useValue: { close: (v: ServiceChoice | undefined) => closed.push(v) },
      },
    ],
  });
  const fixture = TestBed.createComponent(DeliveryAddressDialog);
  fixture.componentRef.setInput('data', { currentId, allowFreeEntry, currentDate });
  fixture.detectChanges();
  return { fixture, closed };
}

const rows = (fixture: ComponentFixture<DeliveryAddressDialog>): readonly HTMLElement[] => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.entry'),
];

const cta = (fixture: ComponentFixture<DeliveryAddressDialog>): HTMLButtonElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector('.cta');

describe('DeliveryAddressDialog', () => {
  it('coche l’adresse par défaut quand le carnet arrive', () => {
    const { fixture } = boot([address({ id: 'a' }), address({ id: 'b', isDefault: true })]);

    expect(rows(fixture)[1]?.getAttribute('aria-checked')).toBe('true');
    expect(rows(fixture)[0]?.getAttribute('aria-checked')).toBe('false');
  });

  /**
   * L'action PORTE le montant : on sait ce qu'on paie avant d'avoir composé le
   * panier. Les frais viennent de la ZONE, jamais du contenu.
   */
  it('met le tarif de la zone dans l’action', () => {
    const { fixture } = boot([address({ id: 'a', isDefault: true, specs: SLOTTED })]);

    expect(cta(fixture)?.textContent).toContain('6,90');
  });

  /**
   * 🔴 HORS ZONE : la rangée reste LISIBLE et dit pourquoi, mais ne se retient
   * pas. Le refus précède l'effort — il n'attend pas le clic sur l'action.
   */
  it('refuse une adresse hors zone, et le dit', () => {
    const { fixture, closed } = boot([address({ id: 'a', codePostal: '75002' })]);

    rows(fixture)[0]?.click();
    fixture.detectChanges();

    expect(rows(fixture)[0]?.textContent).toContain('Hors zone');
    expect(cta(fixture)?.disabled).toBe(true);
    expect(closed).toEqual([]);
  });

  /**
   * 🔴 Hugo, 2026-10-14 : « pas de commande sans créneau ». Le SEUL créneau du
   * carnet partait à `null` (« le serveur le reprend ») sans que le client ait
   * rien choisi ; il se choisit maintenant dans la liste, et c'est lui qui part.
   */
  it('n’envoie rien tant que le seul créneau du carnet n’est pas choisi', () => {
    const { fixture, closed } = boot([address({ id: 'a', isDefault: true, specs: SLOTTED })]);

    expect(cta(fixture)?.disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-book-slot]')).not.toBeNull();
    fixture.componentInstance['slotPick'].set('09:00-11:00');
    fixture.detectChanges();
    cta(fixture)?.click();

    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({
      mode: 'delivery',
      window: { start: '09:00', end: '11:00' },
      codePostal: '73150',
      date: '2026-09-21',
      // L'identité du carnet part avec le choix (2026-09-29).
      deliveryAddressId: 'a',
    });
  });

  /**
   * ⚠️ La fenêtre du carnet se MONTRE quand elle est globale, et seulement
   * alors : un carnet peut en déclarer une par jour, et la journée de livraison
   * ne se choisit pas ici — en nommer une reviendrait à tirer un jour au sort.
   */
  it('montre la fenêtre du carnet quand elle vaut tous les jours', () => {
    const { fixture } = boot([
      address({
        id: 'a',
        isDefault: true,
        specs: {
          note: '',
          slotList: { mode: 'everyday', slots: [{ start: '09:00', end: '11:00' }] },
          deliveryContact: null,
          gps: null,
          signatureRequired: null,
        },
      } as Partial<DeliveryAddressView> & { id: string }),
    ]);

    expect(rows(fixture)[0]?.textContent).toContain('9');
  });

  it('ne montre AUCUNE fenêtre quand le carnet n’en déclare pas', () => {
    const { fixture } = boot([address({ id: 'a', isDefault: true })]);

    expect(rows(fixture)[0]?.querySelector('.window')).toBeNull();
  });

  /** Carnet vide : on dit où il se remplit, on n'ouvre pas un formulaire. */
  it('dit où les adresses se règlent quand le carnet est vide', () => {
    const { fixture } = boot([]);

    expect(rows(fixture)).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Mon compte');
    expect(cta(fixture)?.disabled).toBe(true);
  });

  /**
   * CA1b (2026-10-03) : une livraison ne part plus sans heure. Depuis le
   * 2026-10-12, une adresse du carnet sans créneau inscrit ce jour-là ne fait
   * plus TAPER d'heure : seules les heures inscrites sont valides.
   */
  it('🔴 sans créneau inscrit au carnet, ne demande aucune heure tapée et ne part pas', () => {
    const { fixture, closed } = boot([address({ id: 'a', isDefault: true })]);

    cta(fixture)?.click();

    const host = fixture.nativeElement as HTMLElement;
    expect(cta(fixture)?.disabled).toBe(true);
    expect(host.querySelector('[data-slot-start]')).toBeNull();
    expect(host.querySelector('[data-slot-end]')).toBeNull();
    expect(host.textContent).toContain('Aucune heure de livraison n’est inscrite');
    expect(host.textContent).toContain('« Mon compte »');
    expect(closed).toEqual([]);
  });

  it('🔴 un créneau tapé à la main ne part pas depuis le carnet', () => {
    const { fixture, closed } = boot([address({ id: 'a', isDefault: true })]);
    fixture.componentInstance['slotStart'].set('07:00');
    fixture.componentInstance['slotEnd'].set('08:00');
    fixture.detectChanges();

    cta(fixture)?.click();

    expect(cta(fixture)?.disabled).toBe(true);
    expect(closed).toEqual([]);
  });

  it('en saisie libre (visiteur sans carnet), envoie le créneau tapé', () => {
    const { fixture, closed } = boot([], null, 'slot', true);
    fixture.componentInstance['ligne1'].set('3 rue du Lac');
    fixture.componentInstance['codePostal'].set('73150');
    fixture.componentInstance['ville'].set("Val d'Isère");
    fixture.componentInstance['slotStart'].set('07:00');
    fixture.componentInstance['slotEnd'].set('08:00');
    fixture.detectChanges();

    cta(fixture)?.click();

    expect(closed[0]).toMatchObject({ window: { start: '07:00', end: '08:00' } });
  });

  /** CA3b : plusieurs créneaux au carnet — la commande en porte un, choisi. */
  it('🔴 plusieurs créneaux au carnet : on en choisit un, et c’est lui qui part', () => {
    const specs: DeliverySpecs = {
      ...SLOTTED,
      slotList: {
        mode: 'everyday',
        slots: [
          { start: '07:00', end: '08:00' },
          { start: '18:00', end: '19:00' },
        ],
      },
    };
    const { fixture, closed } = boot([address({ id: 'a', isDefault: true, specs })]);
    expect(cta(fixture)?.disabled).toBe(true);

    fixture.componentInstance['slotPick'].set('18:00-19:00');
    fixture.detectChanges();
    cta(fixture)?.click();

    expect(closed[0]).toMatchObject({ window: { start: '18:00', end: '19:00' } });
  });

  /** CA3 : en échéance, on choisit une heure limite, et aucun début ne part. */
  it('🔴 en échéance, envoie l’heure choisie SANS début', () => {
    const { fixture, closed } = boot([address({ id: 'a', isDefault: true, specs: TWO_DEADLINES })]);
    expect(cta(fixture)?.disabled).toBe(true);

    fixture.componentInstance['deadlinePick'].set('06:00');
    fixture.detectChanges();
    cta(fixture)?.click();

    expect(closed[0]).toMatchObject({ window: { start: null, end: '06:00' } });
  });

  /** Décision Hugo du 2026-10-12 : plus d'« autre heure », seules les échéances inscrites. */
  it('🔴 en échéance, ne propose QUE les échéances inscrites de l’adresse', () => {
    const { fixture } = boot([address({ id: 'a', isDefault: true, specs: TWO_DEADLINES })]);

    const values = fixture.componentInstance['deadlineOptions']().map((option) => option.value);
    expect(values).toEqual(['06:00', '11:00']);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-deadline-typed]')).toBeNull();
    expect(host.textContent).not.toContain('Une autre heure');
  });

  it('🔴 en échéance sans échéance inscrite ce jour-là : ni liste, ni heure tapée, et le dit', () => {
    const { fixture, closed } = boot([address({ id: 'a', isDefault: true })], null, 'deadline');

    cta(fixture)?.click();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-deadline]')).toBeNull();
    expect(host.querySelector('[data-deadline-typed]')).toBeNull();
    expect(host.textContent).toContain('Aucune heure de livraison n’est inscrite');
    expect(cta(fixture)?.disabled).toBe(true);
    expect(closed).toEqual([]);
  });

  it('en saisie libre (visiteur sans carnet), en échéance, envoie l’heure tapée', () => {
    const { fixture, closed } = boot([], null, 'deadline', true);
    fixture.componentInstance['ligne1'].set('3 rue du Lac');
    fixture.componentInstance['codePostal'].set('73150');
    fixture.componentInstance['ville'].set("Val d'Isère");
    fixture.componentInstance['typedDeadline'].set('05:30');
    fixture.detectChanges();

    cta(fixture)?.click();

    expect(closed[0]).toMatchObject({ window: { start: null, end: '05:30' } });
  });

  /** Lot T4 des textes : un remplacement reçu redessine l'écran, sans rechargement. */
  it('se redessine quand un remplacement de son texte arrive', () => {
    const { fixture } = boot([]);
    TestBed.inject(ShopCopyOverrides).receive('fr', { 'deliveryAddress.title': 'Livrer où ?' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.screen')?.textContent).toBe(
      'Livrer où ?',
    );
  });

  describe('le jour de livraison', () => {
    const dayList = (fixture: ComponentFixture<DeliveryAddressDialog>): HTMLElement | null =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-delivery-day]');

    /**
     * Régression (Hugo, 2026-10-13) : « je ne peux pas choisir le jour ». La
     * livraison partait sur la première journée accordée, sans autre choix.
     */
    it('propose un choix du jour, et rend le jour choisi', () => {
      const { fixture, closed } = boot([address({ id: 'a', isDefault: true, specs: SLOTTED })]);
      expect(dayList(fixture)).not.toBeNull();

      fixture.componentInstance['pickDate']('2026-09-23');
      fixture.componentInstance['slotPick'].set('09:00-11:00');
      fixture.detectChanges();
      cta(fixture)?.click();

      expect(closed[0]?.date).toBe('2026-09-23');
    });

    it('repropose le jour déjà retenu', () => {
      const { fixture, closed } = boot(
        [address({ id: 'a', isDefault: true, specs: SLOTTED })],
        null,
        'slot',
        false,
        '2026-09-24',
      );
      fixture.componentInstance['slotPick'].set('09:00-11:00');
      fixture.detectChanges();
      cta(fixture)?.click();

      expect(closed[0]?.date).toBe('2026-09-24');
    });
  });
});
