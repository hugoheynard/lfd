import {
  STAFF_SUGGESTION_PLACEMENTS,
  STAFF_SUGGESTION_TRIGGERS,
  type StaffSuggestionPlacement,
  type StaffSuggestionTriggerKind,
} from "@lfd/contracts";

import {
  SuggestionPlacementMismatchError,
  SuggestionTriggerRefError,
  UnknownSuggestionPlacementError,
  UnknownSuggestionTriggerError,
} from "../errors/staff-suggestion-errors.js";

/**
 * **Ce qui déclenche une suggestion** (§2 du plan) : partout, un article au
 * panier, une famille au panier, une fiche d'article ouverte. `ref` est le SKU
 * ou l'id de la famille ; `null` pour « partout », et seulement pour lui.
 */
export interface SuggestionTrigger {
  readonly kind: StaffSuggestionTriggerKind;
  readonly ref: string | null;
}

/** Ce qu'un déclencheur reçoit avant d'être jugé. */
export interface SuggestionTriggerInput {
  readonly kind: string;
  readonly ref: string | null;
}

/**
 * **Où chaque déclencheur peut être vrai.** Le contenu du panier ne se voit
 * qu'au panier, une fiche ouverte qu'en fiche ; « partout » vaut partout. Le
 * plan ne donnait qu'un cas (« une fiche ouverte ne déclenche pas au
 * panier ») : la table le généralise à son déclencheur symétrique.
 */
const PLACEMENTS_OF: Readonly<
  Record<StaffSuggestionTriggerKind, readonly StaffSuggestionPlacement[]>
> = {
  everywhere: STAFF_SUGGESTION_PLACEMENTS,
  product_in_cart: ["cart"],
  category_in_cart: ["cart"],
  product_viewed: ["product"],
};

/**
 * @throws {UnknownSuggestionTriggerError} le déclencheur n'existe pas.
 * @throws {SuggestionTriggerRefError} « partout » nomme quelque chose, ou un autre ne nomme rien.
 */
export function suggestionTrigger(raw: SuggestionTriggerInput): SuggestionTrigger {
  const kind = STAFF_SUGGESTION_TRIGGERS.find((known) => known === raw.kind);
  if (kind === undefined) {
    throw new UnknownSuggestionTriggerError(raw.kind);
  }
  const ref = raw.ref === null ? null : raw.ref.trim();
  const expectsRef = kind !== "everywhere";
  if (expectsRef !== (ref !== null && ref !== "")) {
    throw new SuggestionTriggerRefError(kind, expectsRef);
  }
  return { kind, ref: expectsRef ? ref : null };
}

/**
 * L'emplacement, jugé contre le déclencheur.
 *
 * @throws {UnknownSuggestionPlacementError} l'emplacement n'existe pas.
 * @throws {SuggestionPlacementMismatchError} le déclencheur ne peut pas y être vrai.
 */
export function suggestionPlacement(
  trigger: SuggestionTrigger,
  raw: string,
): StaffSuggestionPlacement {
  const placement = STAFF_SUGGESTION_PLACEMENTS.find((known) => known === raw);
  if (placement === undefined) {
    throw new UnknownSuggestionPlacementError(raw);
  }
  const allowed = PLACEMENTS_OF[trigger.kind];
  if (!allowed.includes(placement)) {
    throw new SuggestionPlacementMismatchError(trigger.kind, placement, allowed);
  }
  return placement;
}

/** Le SKU que nomme le déclencheur, s'il nomme un article — pas une famille. */
export function triggerSku(trigger: SuggestionTrigger): string | null {
  return trigger.kind === "product_in_cart" || trigger.kind === "product_viewed"
    ? trigger.ref
    : null;
}
