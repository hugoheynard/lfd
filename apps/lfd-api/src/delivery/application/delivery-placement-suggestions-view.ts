import type {
  DeliveryPlacementSuggestionsView,
  DeliveryPlacementSuggestionView,
} from "@lfd/contracts";

import type { RoundRow } from "../domain/ports/delivery-rounds.reader.js";
import type { PlacementSuggestion } from "../domain/services/suggest-placements.js";
import type { LocatedStop } from "./delivery-routing-support.js";

const SECONDS_PER_MINUTE = 60;

/** Ce que la vue des places suggérées assemble. */
export interface PlacementSuggestionsViewInputs {
  readonly day: string;
  /** Les commandes à répartir, dans l'ordre de la carte « À répartir ». */
  readonly unassigned: readonly string[];
  readonly rounds: readonly RoundRow[];
  readonly stops: ReadonlyMap<string, LocatedStop>;
  readonly suggestions: readonly PlacementSuggestion[];
}

/**
 * Une ligne par commande à répartir, dans l'ordre de la carte : la place
 * suggérée avec la version de sa tournée, ou la raison de son absence. Une
 * commande sans point est `unlocated` — le calcul ne l'a jamais vue.
 */
export function placementSuggestionsViewOf(
  inputs: PlacementSuggestionsViewInputs,
): DeliveryPlacementSuggestionsView {
  const byOrder = new Map(inputs.suggestions.map((suggestion) => [suggestion.orderId, suggestion]));
  const rounds = new Map(inputs.rounds.map((round) => [round.id, round]));
  return {
    day: inputs.day,
    suggestions: inputs.unassigned.map((orderId) =>
      lineOf(orderId, inputs.stops.get(orderId), byOrder.get(orderId), rounds),
    ),
  };
}

function lineOf(
  orderId: string,
  stop: LocatedStop | undefined,
  suggestion: PlacementSuggestion | undefined,
  rounds: ReadonlyMap<string, RoundRow>,
): DeliveryPlacementSuggestionView {
  const ref = { orderId, reference: stop?.reference ?? "" };
  if (stop?.point == null || suggestion === undefined) {
    return { ...ref, status: "none", reason: "unlocated" };
  }
  if (suggestion.kind === "none") {
    return { ...ref, status: "none", reason: suggestion.reason };
  }
  const round = rounds.get(suggestion.roundId);
  if (round === undefined) {
    return { ...ref, status: "none", reason: "no_round" };
  }
  return {
    ...ref,
    status: "suggested",
    roundId: round.id,
    roundVersion: round.version,
    vehicleId: round.vehicleId,
    vehicleName: round.vehicleName,
    passage: round.passage,
    after: suggestion.position,
    stopCount: round.stops.length,
    extraMinutes: Math.ceil(suggestion.extraSeconds / SECONDS_PER_MINUTE),
  };
}
