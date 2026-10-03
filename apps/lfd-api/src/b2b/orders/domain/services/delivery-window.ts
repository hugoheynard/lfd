import {
  type FulfillmentMethod,
  type FulfillmentWindow,
  type OrderFulfillment,
  resolveWindowMode,
  type WindowMode,
} from "@lfd/contracts";

import {
  DeadlineWindowHasStartError,
  DeliveryWindowRequiredError,
} from "../errors/order-errors.js";
import type { DeliveryDefaults } from "../ports/delivery-defaults.reader.js";
import { agreeFulfillment, type FulfillmentRequest } from "./agreed-fulfillment.js";

/**
 * **La fenêtre d'une livraison** — créneau ou échéance (plan composition
 * automatique, CA-D2 et CA1b). Règles pures, hors du service de passation :
 * la saisie staff et la boutique les appliquent par le même chemin.
 */

/**
 * La fenêtre que l'adresse **propose** dans son mode.
 *
 * En créneau : son créneau préféré, comme avant. En échéance : l'échéance
 * préférée si elle est **seule** ce jour-là. Quand l'adresse en porte
 * plusieurs (le pain à 06:00, le déjeuner à 11:00), choisir à la place du
 * client serait inventer : rien n'est proposé, et la commande doit dire laquelle.
 */
export function preferredWindowOf(
  mode: WindowMode,
  slot: FulfillmentWindow | null,
  deadlines: readonly string[],
): FulfillmentWindow | null {
  if (mode === "slot") {
    return slot;
  }
  const only = deadlines.length === 1 ? deadlines[0] : undefined;
  return only === undefined ? null : { start: null, end: only };
}

/**
 * Refuse la fenêtre d'une livraison qui ne tient pas son mode.
 *
 * `requested` est ce que la commande a envoyé (`undefined` = rien) ; `agreed`
 * la fenêtre finalement convenue. Seul un début **fourni** est refusé en
 * échéance : un préréglage n'est pas un choix du client.
 *
 * @throws {DeadlineWindowHasStartError} un début fourni en mode échéance.
 * @throws {DeliveryWindowRequiredError} une livraison sans fenêtre.
 */
export function ensureDeliveryWindow(input: {
  readonly method: FulfillmentMethod;
  readonly mode: WindowMode;
  readonly requested: FulfillmentWindow | null | undefined;
  readonly agreed: FulfillmentWindow | null;
}): void {
  if (input.method !== "delivery") {
    return;
  }
  if (input.mode === "deadline" && input.requested?.start != null) {
    throw new DeadlineWindowHasStartError();
  }
  if (input.agreed === null) {
    throw new DeliveryWindowRequiredError();
  }
}

/**
 * L'acheminement convenu, **fenêtre de livraison comprise** : le mode est celui
 * de l'adresse, sinon le global ; la fenêtre proposée suit ce mode ; une
 * livraison sans fenêtre, ou avec un début en échéance, est refusée. Les
 * commandes déjà passées ne sont jamais relues : seule la passation juge.
 *
 * `globalMode` vaut `null` en retrait, qui n'a pas de mode.
 */
export function agreeWithWindow(
  request: FulfillmentRequest & { readonly method: FulfillmentMethod },
  defaults: DeliveryDefaults,
  globalMode: WindowMode | null,
): OrderFulfillment {
  const mode = resolveWindowMode(defaults.windowMode, globalMode ?? "slot");
  const agreed = agreeFulfillment(request, {
    contact: defaults.contact,
    signatureRequired: defaults.signatureRequired,
    window: preferredWindowOf(mode, defaults.window, defaults.deadlines),
    // Les échéances ne valent reprise qu'en mode échéance.
    deadlines: mode === "deadline" ? defaults.deadlines : [],
  });
  ensureDeliveryWindow({
    method: request.method,
    mode,
    requested: request.window,
    agreed: agreed.window.value,
  });
  return agreed;
}
