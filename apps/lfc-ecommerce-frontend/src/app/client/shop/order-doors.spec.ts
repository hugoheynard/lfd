import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PublicDeliveryAvailabilityView } from '@lfd/contracts/shop-values';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ClientAudience } from '../client-audience.service';
import { OrderDoors } from './order-doors';
import { ServicePoints } from './pickup-points.store';

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
