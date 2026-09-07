import { effect, Injectable, signal } from '@angular/core';

import type { BillingAddressPayload, FulfillmentWindow } from '@lfd/contracts';

import { isRecord, readLocal, readString, writeLocal } from './local-store';

/**
 * Le mode de service retenu, avec tout ce qu'il entraîne.
 *
 * La remise et les frais VOYAGENT avec le lieu : ce sont des propriétés du
 * point de retrait ou de la zone, pas des constantes d'écran. Le panier n'a
 * ainsi rien à savoir de la station pour afficher son décompte.
 */
interface ServiceChoiceBase {
  /** Le lieu, tel qu'on le nomme : « Le Labo », « Le Chalet ». */
  readonly place: string;
  /**
   * Le même lieu au complément : « au Labo », « au chalet ». La ligne de remise
   * le lit tel quel — une concaténation avec `place` donnerait « Remise Le
   * Labo ».
   */
  readonly at: string;
  readonly address: string;
  readonly slot: string;
  /**
   * La **fenêtre structurée** derrière le libellé — `{ start, end }` en `HH:mm`.
   *
   * 🔴 Seul le LIBELLÉ voyageait (« 7 h – 8 h »), et il ne dit rien à un
   * serveur : la commande partait donc sans tranche demandée, et le bon de
   * commande n'avait aucune heure à imprimer. Le dialogue de retrait avait
   * pourtant un vrai `PickupSlot` sous la main — il l'aplatissait à la frontière
   * du store.
   *
   * `null` = aucune tranche demandée, ce qui reste un cas légitime : un client
   * peut n'en vouloir aucune, et c'est différent d'une heure inventée.
   */
  readonly window: FulfillmentWindow | null;
  /**
   * **La journée de retrait ou de livraison**, `AAAA-MM-JJ`.
   *
   * Elle était implicite — « les créneaux de demain » — et l'implicite ne
   * traverse pas une API : `requestedDeliveryDate` est obligatoire à la
   * passation, parce que c'est la journée de production. Cf. `slotDate`.
   */
  readonly date: string;
}

/**
 * Le mode de service retenu — **une identité, jamais un montant**.
 *
 * 🔴 Ce type portait `discount` (en pourcent) et `fee` (en euros), lus d'une
 * maquette. Trois choses s'y jouaient mal : la remise d'un point de retrait peut
 * être un MONTANT, que ce champ ne savait pas dire ; les frais voyageaient en
 * euros flottants ; et les deux étaient des nombres que le navigateur pouvait
 * contredire au centime près.
 *
 * Ce qu'il porte désormais est ce que le SERVEUR a besoin de savoir pour
 * chiffrer : quel point, ou quel code postal. Les montants reviennent de
 * `POST /shop/quote`, et le front n'a plus de chiffre à se tromper.
 */
export type ServiceChoice =
  | (ServiceChoiceBase & {
      readonly mode: 'pickup';
      /** Le point retenu, ou `null` pour celui par défaut — comme à la caisse. */
      readonly pickupAddressId: string | null;
    })
  | (ServiceChoiceBase & {
      readonly mode: 'delivery';
      /** Le code postal livré. La ZONE s'en déduit côté serveur, jamais ici. */
      readonly codePostal: string;
      /**
       * **L'adresse complète, telle que la commande l'exige.**
       *
       * Le code postal suffit à CHIFFRER — la zone s'en déduit — mais pas à
       * livrer : `POST /orders` refuse une livraison sans adresse, et il a
       * raison. Deux champs pour deux questions, et non un champ qui servirait
       * mal aux deux.
       */
      readonly deliveryAddress: BillingAddressPayload;
    });

/**
 * La fenêtre relue du stockage local, ou `null`.
 *
 * Validée champ par champ plutôt que castée : ce qui vient de `localStorage` a
 * pu être écrit par une version précédente de l'app, ou à la main. Une forme
 * inattendue vaut « aucune tranche », jamais une heure approximative.
 */
function parseWindow(raw: unknown): FulfillmentWindow | null {
  if (!isRecord(raw)) {
    return null;
  }
  const end = readString(raw['end']);
  if (end === null) {
    return null;
  }
  return { start: readString(raw['start']), end };
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
  const date = readString(raw['date']);
  if (place === null || at === null || address === null || slot === null || date === null) {
    return null;
  }
  // La fenêtre relue du stockage local : absente sur un choix posé avant
  // qu'elle n'existe, ce qui vaut « aucune tranche demandée ». On ne la
  // reconstitue pas depuis le LIBELLÉ — « 7 h – 8 h » n'est pas une heure.
  const base = { place, at, address, slot, date, window: parseWindow(raw['window']) };
  if (mode === 'pickup') {
    // `undefined` et `null` ne se distinguent pas ici, et n'ont pas à l'être :
    // les deux veulent dire « le point par défaut », ce que le serveur sait
    // résoudre.
    return { ...base, mode, pickupAddressId: readString(raw['pickupAddressId']) };
  }
  if (mode === 'delivery') {
    const codePostal = readString(raw['codePostal']);
    const deliveryAddress = parseAddress(raw['deliveryAddress']);
    if (codePostal === null || deliveryAddress === null) {
      return null;
    }
    return { ...base, mode, codePostal, deliveryAddress };
  }
  return null;
}

/**
 * L'adresse relue du navigateur — **validée**, parce que c'est elle qui partira
 * au serveur. Un champ manquant ferait refuser la commande au moment du
 * règlement, sur un panier composé.
 */
function parseAddress(raw: unknown): BillingAddressPayload | null {
  if (!isRecord(raw)) {
    return null;
  }
  const ligne1 = readString(raw['ligne1']);
  const codePostal = readString(raw['codePostal']);
  const ville = readString(raw['ville']);
  const pays = readString(raw['pays']);
  if (ligne1 === null || codePostal === null || ville === null || pays === null) {
    return null;
  }
  return {
    label: readString(raw['label']) ?? '',
    ligne1,
    ligne2: readString(raw['ligne2']) ?? '',
    codePostal,
    ville,
    pays,
  };
}

/**
 * **Le contexte de la commande** — ce qui a été décidé à l'écran de commande, et
 * que tous les écrans suivants portent.
 *
 * Un **store** : un état et sa persistance, aucun comportement. Il s'appelait
 * `ClientOrder`, à une lettre de `ClientOrders` qui garde les commandes PASSÉES
 * — deux noms voisins pour deux choses sans rapport, et rien dans le premier ne
 * disait qu'il n'y avait là qu'un état.
 *
 * Le mode n'est jamais une étape passée : la carte du bandeau le rappelle, le
 * panier le récapitule, la confirmation le répète. Il vit donc plus longtemps
 * qu'un écran — et, depuis qu'il est relu du navigateur, plus longtemps qu'un
 * onglet : rafraîchir la boutique ne renvoie plus à la question.
 *
 * 🔴 **Le `null` est un état de plein droit**, pas un trou à combler : « je
 * n'ai pas encore dit où je suis servi » est ce que la boutique laisse faire —
 * on visite d'abord, on choisit ensuite. Il n'est exigé qu'au règlement. C'est
 * pour ça que ses lecteurs l'INJECTENT au lieu de le recevoir : un état absent
 * qui descend en entrée est un état qu'un parent peut oublier de passer, et le
 * défaut se lirait alors comme « aucun service » plutôt que comme un oubli.
 */
@Injectable({ providedIn: 'root' })
export class OrderContextStore {
  readonly choice = signal<ServiceChoice | null>(readLocal(KEY, parseChoice));

  constructor() {
    effect(() => {
      writeLocal(KEY, this.choice());
    });
  }
}
