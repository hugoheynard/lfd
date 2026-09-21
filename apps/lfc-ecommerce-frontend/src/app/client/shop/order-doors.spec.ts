import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ClientAudience } from '../client-audience.service';
import { ClientFeatureAccess } from '../feature-access/client-feature-access.service';
import { OrderDoors } from './order-doors';
import { ServicePoints } from './pickup-points.store';

/**
 * **Les portes de la commande**, et la seule règle qu'elles arbitrent seules :
 * à qui la livraison est ouverte.
 *
 * 🔴 Un PRO livre par son CONTRAT. La clé d'admin `publicDelivery` ne le
 * concerne pas, et la lui appliquer lui retirerait un service qu'il a négocié.
 * Pour tout le monde d'autre, elle décide — fermée par défaut.
 *
 * ⚠️ Cacher n'est pas fermer : `POST /shop/orders` refuse la même chose en 409,
 * et c'est LUI le mur. Ce que ce fichier éprouve, c'est qu'on ne montre pas une
 * porte qui mène à un refus.
 */
describe('OrderDoors — à qui la livraison est ouverte', () => {
  function doors(audience: 'b2b' | 'b2c', publicDelivery: 'closed' | 'open'): OrderDoors {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: FoldPanelHostService, useValue: {} },
        { provide: ServicePoints, useValue: { nextDayFor: (): string | null => null } },
        { provide: ClientAudience, useValue: { shown: signal(audience) } },
        { provide: ClientFeatureAccess, useValue: { publicDelivery: signal(publicDelivery) } },
      ],
    });
    return TestBed.inject(OrderDoors);
  }

  it('🔴 la ferme à un b2c tant que l’admin ne l’a pas ouverte', () => {
    expect(doors('b2c', 'closed').deliveryOpen()).toBe(false);
  });

  it('🔴 l’ouvre au même b2c quand l’admin l’ouvre', () => {
    expect(doors('b2c', 'open').deliveryOpen()).toBe(true);
  });

  /** Le pro ne dépend pas de la clé : c'est tout l'objet de la distinction. */
  it('🔴 la laisse ouverte à un PRO, clé fermée', () => {
    expect(doors('b2b', 'closed').deliveryOpen()).toBe(true);
  });

  /**
   * ⚠️ Et la porte ne s'ouvre PAS quand elle est fermée : elle rend `false`
   * sans rien montrer. L'appelant qui aurait oublié de la cacher ne fait donc
   * pas de dégât — et `FoldPanelHostService` est un objet vide ici, de sorte
   * qu'un dialogue ouvert par erreur ferait tomber le test.
   */
  it('🔴 n’ouvre aucun dialogue quand elle est fermée', async () => {
    await expect(doors('b2c', 'closed').delivery(null)).resolves.toBe(false);
  });
});
