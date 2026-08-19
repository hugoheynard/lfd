import {
  type DeliveryContact,
  type FulfillmentWindow,
  type OrderFulfillment,
  type PickupOpening,
  pickupWindows,
  windowContains,
} from "@lfd/contracts";

/**
 * **Ce qui est convenu** pour l'acheminement d'une commande, figé à la
 * passation avec la provenance de chaque valeur.
 *
 * Fonction pure, hors de tout handler : c'est une règle métier, pas une
 * orchestration. Elle vaut pour le client comme pour la saisie staff — deux
 * copies auraient divergé, et la seconde serait celle du back-office, donc
 * celle qu'on teste le moins.
 */

/** Les réglages qui préremplissent, lus au moment de la commande. */
export interface FulfillmentDefaults {
  /** Consignes de l'adresse livrée (carnet), ou `null` : retrait, ou adresse dictée. */
  readonly contact: DeliveryContact | null;
  readonly signatureRequired: boolean;
  /** Fenêtre proposée par le réglage, ou `null` si aucune. */
  readonly window: FulfillmentWindow | null;
}

/**
 * Ce que la commande demande — les valeurs résolues telles que l'écran les
 * montre. **`undefined` = ne se prononce pas** : le réglage s'applique tel quel.
 *
 * La distinction avec `null` (« explicitement aucun ») n'est pas un détail : un
 * écran qui ignore encore le champ ne doit pas effacer le contact d'un compte
 * qui en a un.
 */
export interface FulfillmentRequest {
  readonly contact?: DeliveryContact | null | undefined;
  readonly signatureRequired?: boolean | undefined;
  readonly window?: FulfillmentWindow | null | undefined;
}

/** Deux contacts identiques ? Comparaison par valeur : un contact n'a pas d'identité. */
function sameContact(a: DeliveryContact | null, b: DeliveryContact | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.prenom === b.prenom && a.nom === b.nom && a.telephone === b.telephone;
}

/** Deux fenêtres identiques ? Même raison : une fenêtre est une valeur. */
function sameWindow(a: FulfillmentWindow | null, b: FulfillmentWindow | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.start === b.start && a.end === b.end;
}

/**
 * Fige l'acheminement convenu.
 *
 * La **provenance est déduite**, jamais envoyée : une valeur égale au réglage
 * est un `default`, toute autre un `override`. Le client aurait pu joindre un
 * drapeau « j'ai modifié » — il aurait fini par contredire la valeur qu'il
 * accompagne, alors que la comparaison ne peut pas mentir. Un client qui
 * ressaisit exactement le défaut n'a rien décidé, et c'est exact.
 */
export function agreeFulfillment(
  request: FulfillmentRequest,
  defaults: FulfillmentDefaults,
): OrderFulfillment {
  const window = request.window === undefined ? defaults.window : request.window;
  const contact = request.contact === undefined ? defaults.contact : request.contact;
  const signature =
    request.signatureRequired === undefined
      ? defaults.signatureRequired
      : request.signatureRequired;
  return {
    window: { value: window, source: sameWindow(window, defaults.window) ? "default" : "override" },
    contact: {
      value: contact,
      source: sameContact(contact, defaults.contact) ? "default" : "override",
    },
    signatureRequired: {
      value: signature,
      source: signature === defaults.signatureRequired ? "default" : "override",
    },
  };
}

/**
 * La tranche demandée tient-elle dans les heures du point ?
 *
 * `null` = rien à vérifier (aucune tranche demandée). Sinon elle doit tenir dans
 * **l'une** des fenêtres — jamais dans leur union : entre le créneau pro et
 * l'ouverture publique il peut y avoir une porte close, et accepter une heure
 * qui tombe dedans serait promettre une remise impossible.
 *
 * Un point **sans aucune heure déclarée** n'oppose rien : on ne refuse pas une
 * commande parce qu'un réglage n'a pas encore été rempli. C'est à l'écran de
 * réglages de le signaler, pas au client de le subir.
 */
export function windowFitsPickup(
  requested: FulfillmentWindow | null,
  opening: PickupOpening,
): boolean {
  if (requested === null) {
    return true;
  }
  const windows = pickupWindows(opening);
  return windows.length === 0 || windows.some((window) => windowContains(window, requested));
}
