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
import { ServiceModeDialog } from './service-mode-dialog/service-mode-dialog';

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
  discount: null,
  discountAudiences: { b2b: true, b2c: true },
  opening: { proPickup: null, publicOpening: null },
};

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
  function opened(
    availability: Availability,
    pickups: readonly PickupAddressView[] = [LABO],
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
            open: (component: unknown) => {
              names.push(component);
              return { closed: Promise.resolve(undefined) };
            },
          },
        },
        { provide: ClientAudience, useValue: { shown: signal('b2b') } },
        VISITOR_AUTH,
      ],
    });
    TestBed.inject(ServicePoints).receive(pickups, [], [], availability);
    return TestBed.inject(OrderDoors)
      .choose()
      .then(() => names);
  }

  it('🔴 demande « retrait ou coursier ? » quand le coursier est ouvert', async () => {
    expect(await opened({ openToB2b: true, openToB2c: true })).toEqual([ServiceModeDialog]);
  });

  it('va droit au retrait quand le coursier est fermé à la clientèle', async () => {
    expect(await opened({ openToB2b: false, openToB2c: true })).toEqual([PublicHousePickerDialog]);
  });

  /** 2026-10-16 : aucun site ouvert à la clientèle — droit au coursier. */
  it('🔴 va droit au coursier quand la liste servie des points est vide', async () => {
    expect(await opened({ openToB2b: true, openToB2c: true }, [])).toEqual([DeliveryAddressDialog]);
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
