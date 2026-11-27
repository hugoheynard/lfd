import { computed, inject, Injectable, signal } from '@angular/core';
import type { DeliveryAddressView, FulfillmentWindow, PublicPickupSlot } from '@lfd/contracts';

import { ClientAddresses } from '../client-addresses.service';
import { OrderContextStore } from '../order-context.store';
import { PublicSlots } from '../shop/public-slots.gateway';
import { distinctWindows } from './planner-grid';

/** L'heure `HH:mm` d'un instant, à Paris. */
const PARIS_TIME = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Paris',
});

/**
 * **Les créneaux du site**, ceux que « ＋ un créneau » propose (plan
 * `planificateur/plan-planificateur-de-commandes.md`, § 6.1) — lus là où la
 * boutique les lit déjà :
 *
 * - en livraison, les créneaux que le carnet déclare pour l'adresse choisie
 *   (tous les jours confondus) ;
 * - en retrait, les créneaux publiés par le point pour le jour de départ.
 *
 * Rien n'est inventé : sans adresse du carnet ni point nommé, la liste est
 * vide, et seul le créneau du mode de service choisi fait une rangée.
 */
@Injectable()
export class PlannerSlots {
  private readonly addresses = inject(ClientAddresses);
  private readonly publicSlots = inject(PublicSlots);
  private readonly context = inject(OrderContextStore);

  private readonly pickupWindows = signal<readonly FulfillmentWindow[]>([]);

  readonly candidates = computed<readonly FulfillmentWindow[]>(() => {
    const choice = this.context.choice();
    if (choice === null) {
      return [];
    }
    if (choice.mode === 'pickup') {
      return this.pickupWindows();
    }
    const address = this.addresses
      .deliveries()
      .find((entry) => entry.id === choice.deliveryAddressId);
    return address === undefined ? [] : bookWindows(address);
  });

  /** Relit les créneaux publiés du point choisi, pour un jour. */
  async loadPickup(day: string): Promise<void> {
    const choice = this.context.choice();
    if (choice === null || choice.mode !== 'pickup' || choice.pickupAddressId === null) {
      this.pickupWindows.set([]);
      return;
    }
    const slots = await this.publicSlots.forDay(choice.pickupAddressId, day);
    this.pickupWindows.set(pickupWindows(slots));
  }
}

/** Les créneaux du carnet d'une adresse, tous jours confondus. */
export function bookWindows(address: DeliveryAddressView): readonly FulfillmentWindow[] {
  const list = address.specs.slotList;
  const slots =
    list.mode === 'everyday' ? list.slots : Object.values(list.byDay).flatMap((day) => day ?? []);
  return distinctWindows(slots.map((slot) => ({ start: slot.start, end: slot.end })));
}

/** Les créneaux publiés d'un point, en heures de Paris. */
export function pickupWindows(slots: readonly PublicPickupSlot[]): readonly FulfillmentWindow[] {
  return distinctWindows(
    slots.map((slot) => ({
      start: PARIS_TIME.format(new Date(slot.startAt)),
      end: PARIS_TIME.format(new Date(slot.endAt)),
    })),
  );
}
