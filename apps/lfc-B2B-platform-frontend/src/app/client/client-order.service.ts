import { effect, Injectable, signal } from '@angular/core';

import { isRecord, readLocal, readNumber, readString, writeLocal } from './local-store';

/**
 * Le mode de service retenu, avec tout ce qu'il entraîne.
 *
 * La remise et les frais VOYAGENT avec le lieu : ce sont des propriétés du
 * point de retrait ou de la zone, pas des constantes d'écran. Le panier n'a
 * ainsi rien à savoir de la station pour afficher son décompte.
 */
export interface ServiceChoice {
  readonly mode: 'pickup' | 'delivery';
  /** Le lieu, tel qu'on le nomme : « Le Labo », « Le Chalet ». */
  readonly place: string;
  /**
   * Le même lieu au complément : « au Labo », « au chalet ». La ligne de remise
   * le lit tel quel — une concaténation avec `place` donnerait « Remise Le
   * Labo ».
   */
  readonly at: string;
  readonly address: string;
  /** La remise consentie, en pourcentage. Zéro en livraison. */
  readonly discount: number;
  /** Les frais de coursier, en euros. Zéro en retrait — toujours. */
  readonly fee: number;
  readonly slot: string;
}

const KEY = 'order.choice';

/** Ce qui est relu du navigateur est du texte : on VALIDE avant de le croire. */
export function parseChoice(raw: unknown): ServiceChoice | null {
  if (!isRecord(raw)) {
    return null;
  }
  const mode = readString(raw['mode']);
  const place = readString(raw['place']);
  const at = readString(raw['at']);
  const address = readString(raw['address']);
  const slot = readString(raw['slot']);
  const discount = readNumber(raw['discount']);
  const fee = readNumber(raw['fee']);
  if (mode === null || place === null || at === null || address === null || slot === null) {
    return null;
  }
  if (discount === null || fee === null || (mode !== 'pickup' && mode !== 'delivery')) {
    return null;
  }
  return { mode, place, at, address, discount, fee, slot };
}

/**
 * Ce qui a été décidé à l'écran de commande, et que la boutique porte ensuite.
 *
 * Le mode n'est jamais une étape passée : la barre du rayon le rappelle, le
 * panier le récapitule, la confirmation le répète. Il vit donc plus longtemps
 * qu'un écran — et, depuis qu'il est relu du navigateur, plus longtemps qu'un
 * onglet : rafraîchir la boutique ne renvoie plus à la question.
 */
@Injectable({ providedIn: 'root' })
export class ClientOrder {
  readonly choice = signal<ServiceChoice | null>(readLocal(KEY, parseChoice));

  constructor() {
    effect(() => {
      writeLocal(KEY, this.choice());
    });
  }
}
