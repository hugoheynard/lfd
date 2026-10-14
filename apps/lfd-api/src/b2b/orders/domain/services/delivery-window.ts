import {
  type FulfillmentMethod,
  type FulfillmentWindow,
  type OrderFulfillment,
  resolveWindowMode,
  type WindowMode,
} from "@lfd/contracts";

import {
  DeadlineNotRegisteredError,
  DeadlineWindowHasStartError,
  FulfillmentWindowRequiredError,
  SlotNotRegisteredError,
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
 * Qui demande la fenêtre. Un client **pro** (`pro`) ne demande qu'une fenêtre
 * (échéance ou créneau) inscrite sur son adresse : elle a été définie avec le
 * commercial (Hugo, 2026-10-12). Un particulier (`individual`) n'a ni carnet
 * ni commercial, et la saisie staff (`staff`) reste libre — deux choix
 * provisoires du 2026-10-12, que Hugo doit encore trancher.
 */
export type WindowRequester = "pro" | "individual" | "staff";

/**
 * Refuse la fenêtre d'une livraison qui ne tient pas son mode.
 *
 * `requested` est ce que la commande a envoyé (`undefined` = rien) ; `agreed`
 * la fenêtre finalement convenue. Seul un début **fourni** est refusé en
 * échéance : un préréglage n'est pas un choix du client.
 *
 * @throws {DeadlineWindowHasStartError} un début fourni en mode échéance.
 * @throws {DeadlineNotRegisteredError} une échéance demandée par un client pro
 *   qui n'est pas inscrite sur l'adresse ce jour-là.
 * @throws {SlotNotRegisteredError} un créneau demandé par un client pro qui
 *   n'est pas inscrit sur l'adresse ce jour-là.
 * @throws {FulfillmentWindowRequiredError} une livraison sans fenêtre.
 */
export function ensureDeliveryWindow(input: {
  readonly method: FulfillmentMethod;
  readonly mode: WindowMode;
  readonly requested: FulfillmentWindow | null | undefined;
  readonly agreed: FulfillmentWindow | null;
  /** Les échéances inscrites de l'adresse pour le jour servi. */
  readonly deadlines: readonly string[];
  /** Les créneaux inscrits de l'adresse pour le jour servi. */
  readonly slots: readonly FulfillmentWindow[];
  readonly requestedBy: WindowRequester;
}): void {
  if (input.method !== "delivery") {
    return;
  }
  if (input.mode === "deadline" && input.requested?.start != null) {
    throw new DeadlineWindowHasStartError();
  }
  ensureRegisteredWindow(input);
  if (input.agreed === null) {
    throw new FulfillmentWindowRequiredError("delivery");
  }
}

/** `06:00–08:00`, la forme lue par le client dans un refus. */
function slotLabel(slot: FulfillmentWindow): string {
  return `${slot.start ?? ""}–${slot.end}`;
}

/**
 * Un client pro ne demande qu'une fenêtre inscrite sur l'adresse ce jour-là
 * (décision Hugo du 2026-10-12) ; le particulier et le staff restent libres. Rien de demandé =
 * rien à juger : la préférence reprise vient de la liste.
 */
function ensureRegisteredWindow(input: {
  readonly mode: WindowMode;
  readonly requested: FulfillmentWindow | null | undefined;
  readonly deadlines: readonly string[];
  readonly slots: readonly FulfillmentWindow[];
  readonly requestedBy: WindowRequester;
}): void {
  const requested = input.requested;
  if (input.requestedBy !== "pro" || requested == null) {
    return;
  }
  if (input.mode === "deadline") {
    if (!input.deadlines.includes(requested.end)) {
      throw new DeadlineNotRegisteredError(requested.end, input.deadlines);
    }
    return;
  }
  const registered = input.slots.some(
    (slot) => slot.start === requested.start && slot.end === requested.end,
  );
  if (!registered) {
    throw new SlotNotRegisteredError(slotLabel(requested), input.slots.map(slotLabel));
  }
}

/**
 * La commande a-t-elle CHOISI son créneau ? Décision de Hugo du 2026-10-14 :
 * « pas de commande sans créneau » — retrait comme livraison, client, invité
 * comme équipe. `undefined` (« ne se prononce pas ») et `null` (« aucun »)
 * sont refusés pareil : le réglage propose, il ne choisit plus à la place.
 *
 * @throws {FulfillmentWindowRequiredError} aucun créneau dans la demande.
 */
export function ensureWindowChosen(
  method: FulfillmentMethod,
  requested: FulfillmentWindow | null | undefined,
): FulfillmentWindow {
  if (requested === undefined || requested === null) {
    throw new FulfillmentWindowRequiredError(method);
  }
  return requested;
}

/**
 * L'acheminement convenu, **créneau compris** : la commande doit l'avoir
 * choisi ({@link ensureWindowChosen}) ; en livraison, le mode est celui de
 * l'adresse, sinon le global, et un début en échéance est refusé. La
 * provenance reste déduite : un créneau égal à la proposition du réglage est
 * un `default` CHOISI, jamais un défaut appliqué en silence. Les commandes
 * déjà passées ne sont jamais relues : seule la passation juge.
 *
 * `globalMode` vaut `null` en retrait, qui n'a pas de mode.
 */
export function agreeWithWindow(
  request: FulfillmentRequest & { readonly method: FulfillmentMethod },
  defaults: DeliveryDefaults,
  globalMode: WindowMode | null,
  requestedBy: WindowRequester,
): OrderFulfillment {
  const window = ensureWindowChosen(request.method, request.window);
  const mode = resolveWindowMode(defaults.windowMode, globalMode ?? "deadline");
  const agreed = agreeFulfillment(
    { ...request, window },
    {
      contact: defaults.contact,
      signatureRequired: defaults.signatureRequired,
      window: preferredWindowOf(mode, defaults.window, defaults.deadlines),
      // Les échéances ne valent reprise qu'en mode échéance.
      deadlines: mode === "deadline" ? defaults.deadlines : [],
    },
  );
  ensureDeliveryWindow({
    method: request.method,
    mode,
    requested: window,
    agreed: agreed.window.value,
    deadlines: defaults.deadlines,
    slots: defaults.slots,
    requestedBy,
  });
  return agreed;
}
