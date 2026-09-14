import { computed, inject, Injectable } from '@angular/core';

import { ClientAddresses } from './client-addresses.service';
import { ClientCompany } from './client-company.service';
import { ClientLocale, LOCALES } from './client-locale.service';
import { ClientCopyService } from './copy/client-copy.service';
import { ServicePoints } from './shop/pickup-points.store';

/**
 * **Les préférences du client, mises en mots** — ce que lisent les deux cartes
 * « Préférences » de `/mon-compte` et leur panneau, calculé ici une fois.
 */
@Injectable({ providedIn: 'root' })
export class ClientPreferences {
  private readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);
  private readonly addresses = inject(ClientAddresses);
  private readonly service = inject(ServicePoints);
  private readonly locale = inject(ClientLocale);

  /**
   * **Comment cette maison est servie d'habitude** — le point de départ de ses
   * commandes, jamais une contrainte.
   *
   * 🔴 La maquette écrivait « Le Labo · 7 h – 8 h », un point ET un créneau, en
   * dur. La préférence porte un MODE et une adresse, jamais une heure : un
   * créneau se choisit à chaque commande, et l'annoncer comme une habitude
   * laissait croire qu'il était réservé.
   */
  readonly habit = computed(() => {
    const preference = this.client.company()?.fulfillmentPreference ?? null;
    const copy = this.t().account;
    if (preference === null || preference.method === null) {
      return copy.prefNone;
    }
    if (preference.method === 'pickup') {
      const point = this.service.pickups().find((p) => p.id === preference.pickupAddressId);
      return point === undefined ? copy.prefPickupAny : `${copy.prefPickupAt} ${point.label}`;
    }
    const address = this.addresses.deliveries().find((a) => a.id === preference.deliveryAddressId);
    return address === undefined ? copy.prefDeliveryAny : `${copy.prefDeliveryTo} ${address.label}`;
  });

  /**
   * La langue de l'interface — celle qu'on est **en train de lire**. Écrite
   * « Français » en dur, elle affirmait le contraire de l'écran dès qu'on
   * basculait en anglais.
   */
  readonly language = computed(() => {
    const code = this.locale.current();
    return LOCALES.find((entry) => entry.code === code)?.name ?? code;
  });
}
