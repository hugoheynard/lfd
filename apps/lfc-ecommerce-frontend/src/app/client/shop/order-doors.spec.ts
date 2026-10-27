import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PickupAddressView } from '@lfd/contracts';
import type { PublicDeliveryAvailabilityView } from '@lfd/contracts/shop-values';
import { FoldPanelHostService } from 'fold-ng';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';

import { ClientAudience } from '../client-audience.service';
import { matchMediaAt } from '../mon-compte/account.fixture';
import { DeliveryAddressDialog } from './delivery-address-dialog/delivery-address-dialog';
import { OrderDoors } from './order-doors';
import { ServicePoints } from './pickup-points.store';
import { PublicHousePickerDialog } from './public-house-picker-dialog/public-house-picker-dialog';
import { ServiceChangeDialog } from './service-change-dialog/service-change-dialog';
import { ServiceModeDialog } from './service-mode-dialog/service-mode-dialog';
import { SlotPickerDialog } from './slot-picker-dialog/slot-picker-dialog';
import { DayPickerDialog } from './day-picker-dialog/day-picker-dialog';
import { OrderContextStore } from '../order-context.store';

/**
 * Un visiteur : la liste posée par `receive` vaut pour lui. Sans session
 * déclarée, aucun lecteur n'est connu et une liste vide ne dit rien.
 */
const VISITOR_AUTH = {
  provide: AuthFacade,
  useValue: { isAuthenticated: signal(false), accessToken$: () => of('jeton') },
};

/** Un point servi à qui regarde : le retrait est ouvert. */
const LABO: PickupAddressView = {
  id: 'pick_labo',
  label: 'Le Labo',
  ligne1: 'Route de la Balme',
  ligne2: '',
  codePostal: '73150',
  ville: 'Val d’Isère',
  pays: 'France',
  discounts: { b2b: null, b2c: null },
  opening: { proPickup: null, publicOpening: null },
};

/** Le jour pris au panneau, et un jour plus tardif. Comparés entre eux seulement. */
const VILLAGE: PickupAddressView = { ...LABO, id: 'pick_village', label: 'Le Village' };
const DAY = '2026-11-03';
const LATER = '2026-11-05';

/** Le réglage « Livraison » tel que l'admin le pose, sans le mode de fenêtre. */
type Availability = Pick<PublicDeliveryAvailabilityView, 'openToB2b' | 'openToB2c'>;

/**
 * **Les portes de la commande**, et la seule règle qu'elles arbitrent seules :
 * à qui la livraison est ouverte.
 *
 * 🔴 Le réglage « Livraison » du back-office vise une clientèle ENTIÈRE, pros
 * compris, et il est la seule porte depuis le 2026-10-09 (clé `publicDelivery`
 * retirée). Il est posé par `ServicePoints.receive` — le vrai dépôt, pas un
 * doublé : ce qui est éprouvé est son défaut ouvert tant que rien n'est lu.
 *
 * ⚠️ Cacher n'est pas fermer : le serveur refuse la même chose en 409, et c'est
 * LUI le mur. Ce que ce fichier éprouve, c'est qu'on ne montre pas une porte qui
 * mène à un refus.
 */
describe('OrderDoors — à qui la livraison est ouverte', () => {
  function doors(audience: 'b2b' | 'b2c', availability: Availability | null = null): OrderDoors {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FoldPanelHostService, useValue: {} },
        { provide: ClientAudience, useValue: { shown: signal(audience) } },
      ],
    });
    // `null` = réglage pas encore lu : le dépôt garde son défaut, ouvert aux deux.
    TestBed.inject(ServicePoints).receive([], [], [], availability);
    return TestBed.inject(OrderDoors);
  }

  /** Le défaut tant que rien n'est lu : ouvert aux deux, le serveur garde le refus. */
  it('l’ouvre à un b2c comme à un pro tant que le réglage n’est pas lu', () => {
    expect(doors('b2c').deliveryOpen()).toBe(true);
    expect(doors('b2b').deliveryOpen()).toBe(true);
  });

  /** Régression (audit B5, 2026-10-07) : le pro gardait la porte que le réglage lui fermait. */
  it('🔴 ferme la porte du coursier à un PRO quand le réglage « Livraison » la ferme aux pros', () => {
    expect(doors('b2b', { openToB2b: false, openToB2c: true }).deliveryOpen()).toBe(false);
  });

  it('🔴 la ferme à un b2c quand le réglage la ferme aux particuliers', () => {
    expect(doors('b2c', { openToB2b: true, openToB2c: false }).deliveryOpen()).toBe(false);
  });

  /** Le réglage vise UNE clientèle : fermer l'autre ne touche pas celle-ci. */
  it('laisse la porte d’un pro ouverte quand le réglage ne ferme que les particuliers', () => {
    expect(doors('b2b', { openToB2b: true, openToB2c: false }).deliveryOpen()).toBe(true);
  });

  it('laisse la porte d’un b2c ouverte quand le réglage ne ferme que les pros', () => {
    expect(doors('b2c', { openToB2b: false, openToB2c: true }).deliveryOpen()).toBe(true);
  });

  /**
   * ⚠️ Et la porte ne s'ouvre PAS quand elle est fermée : elle rend `false`
   * sans rien montrer. L'appelant qui aurait oublié de la cacher ne fait donc
   * pas de dégât — et `FoldPanelHostService` est un objet vide ici, de sorte
   * qu'un dialogue ouvert par erreur ferait tomber le test.
   */
  it('🔴 n’ouvre aucun dialogue quand elle est fermée', async () => {
    await expect(doors('b2c', { openToB2b: true, openToB2c: false }).delivery(null)).resolves.toBe(
      false,
    );
  });

  it('🔴 n’ouvre aucun dialogue à un pro quand le réglage la lui ferme', async () => {
    await expect(doors('b2b', { openToB2b: false, openToB2c: true }).delivery(null)).resolves.toBe(
      false,
    );
  });
});

/**
 * Régression (Hugo, 2026-10-13, O6) : sans service, « Régler » ouvrait le
 * retrait d'office. `choose` pose d'abord « retrait ou coursier ? » — mais
 * seulement quand le coursier est ouvert à la clientèle.
 */
describe('OrderDoors.choose — rien de choisi', () => {
  /** Les dialogues ouverts, et les données qu'ils ont reçues. */
  function opened(
    availability: Availability,
    pickups: readonly PickupAddressView[] = [LABO, VILLAGE],
    replies: ReadonlyMap<unknown, unknown> = new Map<unknown, unknown>([[DayPickerDialog, DAY]]),
    datas: unknown[] = [],
  ): Promise<readonly unknown[]> {
    const names: unknown[] = [];
    // `dialogSide()` lit `matchMedia` pour choisir le côté du panneau.
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: FoldPanelHostService,
          useValue: {
            open: (component: unknown, options?: { data?: unknown }) => {
              names.push(component);
              datas.push(options?.data);
              return { closed: Promise.resolve(replies.get(component)) };
            },
          },
        },
        { provide: ClientAudience, useValue: { shown: signal('b2b') } },
        VISITOR_AUTH,
      ],
    });
    TestBed.inject(ServicePoints).receive(
      pickups,
      [],
      [
        { pickupAddressId: LABO.id, date: DAY, orderUntil: null },
        { pickupAddressId: 'pick_village', date: LATER, orderUntil: null },
        { pickupAddressId: null, date: DAY, orderUntil: null },
      ],
      availability,
    );
    return TestBed.inject(OrderDoors)
      .choose()
      .then(() => names);
  }

  it('🔴 demande « retrait ou coursier ? » après le jour quand le coursier est ouvert', async () => {
    expect(await opened({ openToB2b: true, openToB2c: true })).toEqual([
      DayPickerDialog,
      ServiceModeDialog,
    ]);
  });

  it('va droit au retrait après le jour quand le coursier est fermé à la clientèle', async () => {
    expect(await opened({ openToB2b: false, openToB2c: true })).toEqual([
      DayPickerDialog,
      PublicHousePickerDialog,
    ]);
  });

  /** 2026-10-16 : aucun site ouvert à la clientèle — droit au coursier. */
  it('🔴 va droit au coursier après le jour quand la liste servie des points est vide', async () => {
    expect(await opened({ openToB2b: true, openToB2c: true }, [])).toEqual([
      DayPickerDialog,
      DeliveryAddressDialog,
    ]);
  });

  /** Plan `plan-panneau-date.md` : le jour est la PREMIÈRE question, et la fermer ne pose rien. */
  it('🔴 fermer le panneau du jour n’ouvre rien d’autre et ne pose aucun choix', async () => {
    const names = await opened({ openToB2b: true, openToB2c: true }, [LABO], new Map());
    expect(names).toEqual([DayPickerDialog]);
    expect(TestBed.inject(OrderContextStore).choice()).toBeNull();
  });

  it('passe le jour au choix de la maison, puis au sélecteur d’heure', async () => {
    const datas: unknown[] = [];
    const replies = new Map<unknown, unknown>([
      [DayPickerDialog, DAY],
      [ServiceModeDialog, 'pickup'],
      [PublicHousePickerDialog, LABO],
    ]);
    const names = await opened(
      { openToB2b: true, openToB2c: true },
      [LABO, VILLAGE],
      replies,
      datas,
    );
    expect(names).toEqual([
      DayPickerDialog,
      ServiceModeDialog,
      PublicHousePickerDialog,
      SlotPickerDialog,
    ]);
    expect(datas[2]).toMatchObject({ day: DAY });
    expect(datas[3]).toMatchObject({ openOn: DAY });
  });

  /** Une seule maison servie : le jour, puis l'heure (Hugo, 2026-10-27). */
  it('🔴 avec une seule maison, ne demande pas de la choisir', async () => {
    const datas: unknown[] = [];
    const replies = new Map<unknown, unknown>([
      [DayPickerDialog, DAY],
      [ServiceModeDialog, 'pickup'],
    ]);
    const names = await opened({ openToB2b: true, openToB2c: true }, [LABO], replies, datas);
    expect(names).toEqual([DayPickerDialog, ServiceModeDialog, SlotPickerDialog]);
    expect(datas[2]).toMatchObject({ openOn: DAY });
  });

  it('passe le jour au coursier en `currentDate`', async () => {
    const datas: unknown[] = [];
    const replies = new Map<unknown, unknown>([
      [DayPickerDialog, DAY],
      [ServiceModeDialog, 'delivery'],
    ]);
    await opened({ openToB2b: true, openToB2c: true }, [LABO], replies, datas);
    expect(datas[2]).toMatchObject({ currentDate: DAY });
  });

  it('🔴 n’ouvre rien quand ni le retrait ni le coursier ne sont proposés', async () => {
    expect(await opened({ openToB2b: false, openToB2c: true }, [])).toEqual([]);
  });
});

/**
 * **La porte du retrait** (Hugo, 2026-10-16) : plus de site par défaut, rien
 * ne garantit qu'un site reste ouvert à une clientèle. Fermée quand la liste
 * SERVIE est vide ; ouverte tant que rien n'est servi.
 */
describe('OrderDoors — à qui le retrait est ouvert', () => {
  function doors(
    pickups: readonly PickupAddressView[] | null,
    availability: Availability | null = null,
  ): OrderDoors {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FoldPanelHostService, useValue: {} },
        { provide: ClientAudience, useValue: { shown: signal('b2c') } },
        VISITOR_AUTH,
      ],
    });
    if (pickups !== null) {
      TestBed.inject(ServicePoints).receive(pickups, [], [], availability);
    }
    return TestBed.inject(OrderDoors);
  }

  it('reste ouverte tant que la liste n’est pas servie', () => {
    expect(doors(null).pickupOpen()).toBe(true);
  });

  it('🔴 se ferme quand la liste servie est vide', () => {
    expect(doors([]).pickupOpen()).toBe(false);
  });

  it('reste ouverte quand un point est servi', () => {
    expect(doors([LABO]).pickupOpen()).toBe(true);
  });

  it('dit qu’on peut servir tant qu’une des deux portes est ouverte', () => {
    expect(doors([], { openToB2b: true, openToB2c: true }).serviceOffered()).toBe(true);
    expect(doors([LABO], { openToB2b: true, openToB2c: false }).serviceOffered()).toBe(true);
  });

  it('🔴 dit qu’on ne peut pas servir sans retrait ni coursier', () => {
    expect(doors([], { openToB2b: true, openToB2c: false }).serviceOffered()).toBe(false);
  });

  /** `FoldPanelHostService` est vide : un dialogue ouvert par erreur ferait tomber le test. */
  it('🔴 n’ouvre aucun dialogue quand elle est fermée', async () => {
    await expect(doors([]).pickup(null)).resolves.toBe(false);
  });
});

/**
 * **Le brouillon du parcours** (plan `plan-barre-qui-accompagne.md`) : posé à
 * chaque étape, complété, effacé quand le choix s'écrit, gardé quand on ferme
 * en route — la barre du panier le dit.
 */
describe('OrderDoors — le brouillon du parcours', () => {
  const SLOT = { day: DAY, time: '07:30', endAt: `${DAY}T06:45:00.000Z` };

  /** Les dialogues ouverts, avec le brouillon tel qu'il était à leur ouverture. */
  function setup(replies: ReadonlyMap<unknown, unknown>, pickups = [LABO, VILLAGE]) {
    const seen: { component: unknown; draft: unknown }[] = [];
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: FoldPanelHostService,
          useValue: {
            open: (component: unknown) => {
              seen.push({ component, draft: TestBed.inject(OrderContextStore).draft() });
              return { closed: Promise.resolve(replies.get(component)) };
            },
          },
        },
        { provide: ClientAudience, useValue: { shown: signal('b2c') } },
        VISITOR_AUTH,
      ],
    });
    TestBed.inject(ServicePoints).receive(
      pickups,
      [],
      [{ pickupAddressId: LABO.id, date: DAY, orderUntil: null }],
      { openToB2b: true, openToB2c: true },
    );
    return { doors: TestBed.inject(OrderDoors), store: TestBed.inject(OrderContextStore), seen };
  }

  it('🔴 se pose à chaque étape, puis s’efface quand le choix complet s’écrit', async () => {
    const { doors, store, seen } = setup(
      new Map<unknown, unknown>([
        [DayPickerDialog, DAY],
        [ServiceModeDialog, 'pickup'],
        [PublicHousePickerDialog, LABO],
        [SlotPickerDialog, SLOT],
      ]),
    );

    expect(await doors.choose()).toBe(true);

    expect(seen.map((step) => step.draft)).toEqual([
      {},
      { date: DAY },
      { date: DAY, mode: 'pickup' },
      {
        date: DAY,
        mode: 'pickup',
        place: 'Le Labo',
        pickupAddressId: LABO.id,
        address: 'Route de la Balme, Val d’Isère',
      },
    ]);
    expect(store.draft()).toBeNull();
    expect(store.choice()).toMatchObject({ mode: 'pickup', date: DAY, place: 'Le Labo' });
  });

  it('🔴 est gardé quand on ferme l’heure en route', async () => {
    const { doors, store } = setup(
      new Map<unknown, unknown>([
        [DayPickerDialog, DAY],
        [ServiceModeDialog, 'pickup'],
        [PublicHousePickerDialog, LABO],
      ]),
    );

    expect(await doors.choose()).toBe(false);

    expect(store.draft()).toMatchObject({ date: DAY, mode: 'pickup', place: 'Le Labo' });
    expect(store.choice()).toBeNull();
  });

  it('ne garde rien quand on ferme le panneau du jour sans rien avoir dit', async () => {
    const { doors, store } = setup(new Map());

    await doors.choose();

    expect(store.draft()).toBeNull();
  });

  it('la porte du retrait dit son mode, et la maison quand elle est seule, dès le jour', async () => {
    const { doors, seen } = setup(new Map(), [LABO]);

    await doors.startPickup();

    expect(seen[0]?.draft).toMatchObject({ mode: 'pickup', place: 'Le Labo' });
  });

  it('🔴 la reprise rouvre l’heure de la maison retenue, sans redemander le jour', async () => {
    const { doors, store, seen } = setup(
      new Map<unknown, unknown>([
        [DayPickerDialog, DAY],
        [ServiceModeDialog, 'pickup'],
        [PublicHousePickerDialog, LABO],
      ]),
    );
    await doors.choose();
    seen.length = 0;

    // La seconde fois, l'heure se prend.
    const resumed = setup(new Map<unknown, unknown>([[SlotPickerDialog, SLOT]]));
    resumed.store.draft.set(store.draft());
    expect(await resumed.doors.resume()).toBe(true);

    expect(resumed.seen.map((step) => step.component)).toEqual([SlotPickerDialog]);
    expect(resumed.store.draft()).toBeNull();
    expect(resumed.store.choice()).toMatchObject({ date: DAY, pickupAddressId: LABO.id });
  });

  /**
   * Régression (Hugo, 2026-10-27) : depuis la boutique, la barre et « Régler »
   * passaient par `choose()`, qui repartait de zéro et redemandait « retrait
   * ou livraison ? » à qui y avait répondu.
   */
  it('🔴 choose() reprend un brouillon au lieu de redemander le mode', async () => {
    const { doors, store, seen } = setup(
      new Map<unknown, unknown>([
        [PublicHousePickerDialog, LABO],
        [SlotPickerDialog, SLOT],
      ]),
    );
    store.draft.set({ date: DAY, mode: 'pickup' });

    expect(await doors.choose()).toBe(true);

    expect(seen.map((step) => step.component)).toEqual([PublicHousePickerDialog, SlotPickerDialog]);
  });

  /** Régression (Hugo, 2026-10-27) : « Modifier » rouvrait l'heure sur les onglets de la semaine. */
  it('🔴 « Modifier » rouvre l’heure sur le jour retenu', async () => {
    const opened: unknown[] = [];
    const { doors, store } = setup(new Map());
    const panels = TestBed.inject(FoldPanelHostService);
    const open = panels.open.bind(panels);
    panels.open = ((component: unknown, config: { data?: unknown }) => {
      opened.push(config.data);
      return open(component as never, config as never);
    }) as typeof panels.open;
    store.choice.set({
      mode: 'pickup',
      place: 'Le Labo',
      at: 'au Labo',
      address: 'Route de la Balme, Val d’Isère',
      pickupAddressId: LABO.id,
      slot: '7 h 30',
      window: { start: '07:30', end: '07:45' },
      date: DAY,
    });

    await doors.time(LABO.id, 'Le Labo', 'Route de la Balme, Val d’Isère');

    expect(opened[0]).toMatchObject({ openOn: DAY });
  });

  describe('« Modifier » une commande située', () => {
    const SITUATED = {
      mode: 'pickup' as const,
      place: 'Le Labo',
      at: 'au Labo',
      address: 'Route de la Balme, Val d’Isère',
      pickupAddressId: LABO.id,
      slot: '7 h 30',
      window: { start: '07:30', end: '07:45' },
      date: DAY,
    };

    it('🔴 « Changer la date » demande le jour, puis l’heure de la MÊME maison', async () => {
      const { doors, store, seen } = setup(
        new Map<unknown, unknown>([
          [ServiceChangeDialog, 'date'],
          [DayPickerDialog, DAY],
          [SlotPickerDialog, SLOT],
        ]),
      );
      store.choice.set(SITUATED);

      expect(await doors.modify()).toBe(true);

      expect(seen.map((step) => step.component)).toEqual([
        ServiceChangeDialog,
        DayPickerDialog,
        SlotPickerDialog,
      ]);
    });

    it('« Changer l’heure » rouvre l’heure seule', async () => {
      const { doors, store, seen } = setup(
        new Map<unknown, unknown>([[ServiceChangeDialog, 'time']]),
      );
      store.choice.set(SITUATED);

      await doors.modify();

      expect(seen.map((step) => step.component)).toEqual([ServiceChangeDialog, SlotPickerDialog]);
    });

    it('fermer le panneau ne change rien', async () => {
      const { doors, store, seen } = setup(new Map());
      store.choice.set(SITUATED);

      expect(await doors.modify()).toBe(false);

      expect(seen.map((step) => step.component)).toEqual([ServiceChangeDialog]);
      expect(store.choice()).toEqual(SITUATED);
      expect(store.draft()).toBeNull();
    });
  });

  it('un « Modifier » abandonné laisse le service tel quel, sans brouillon', async () => {
    const { doors, store } = setup(new Map());
    store.choice.set({
      mode: 'pickup',
      place: 'Le Labo',
      at: 'au Le Labo',
      address: 'Route de la Balme, Val d’Isère',
      pickupAddressId: LABO.id,
      slot: '7 h 30',
      window: null,
      date: DAY,
    });

    expect(await doors.time(LABO.id, 'Le Labo', 'Route de la Balme, Val d’Isère')).toBe(false);

    expect(store.draft()).toBeNull();
    expect(store.choice()).not.toBeNull();
  });

  it('les questions posées seules (commande passée) ne touchent pas au brouillon', async () => {
    const { doors, store } = setup(new Map<unknown, unknown>([[DayPickerDialog, DAY]]));

    await doors.askDay();

    expect(store.draft()).toBeNull();
  });
});
