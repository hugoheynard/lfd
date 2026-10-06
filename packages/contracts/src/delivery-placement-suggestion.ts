import type { DeliveryRoundOrderRef } from "./delivery-rounds.js";

/**
 * Pourquoi aucune place n'est suggérée à une commande à répartir (CA7) :
 * aucune tournée n'a la place dans sa caisse (`capacity`), aucun véhicule
 * qui porte une tournée n'est autorisé sur sa zone (`zone`), la meilleure
 * place ferait manquer une échéance (`deadline`), aucune tournée au dépôt
 * sans bac chargé où l'insérer (`no_round`), ou l'adresse n'est pas située
 * (`unlocated`).
 */
export type DeliveryNoPlacementReason = "capacity" | "zone" | "deadline" | "no_round" | "unlocated";

/**
 * « Place suggérée : Camionnette 2, entre l'arrêt 4 et 5 (+6 min) » — la
 * commande se pose après les `after` premiers arrêts de la tournée.
 * `roundVersion` est la version lue avec la suggestion : « Placer ici » la
 * renvoie, et la tournée qui a bougé depuis refuse (409).
 */
export interface DeliverySuggestedPlacementView extends DeliveryRoundOrderRef {
  readonly status: "suggested";
  readonly roundId: string;
  readonly roundVersion: number;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly passage: number;
  /** Combien d'arrêts de la tournée passent avant elle : 0 = en tête. */
  readonly after: number;
  /** Les arrêts de la tournée avant l'insertion. */
  readonly stopCount: number;
  /** Ce que la tournée dure de plus, en minutes arrondies au-dessus. */
  readonly extraMinutes: number;
}

export interface DeliveryNoPlacementView extends DeliveryRoundOrderRef {
  readonly status: "none";
  readonly reason: DeliveryNoPlacementReason;
}

export type DeliveryPlacementSuggestionView =
  DeliverySuggestedPlacementView | DeliveryNoPlacementView;

/**
 * **Les places suggérées d'un jour** (CA7) : une par commande à répartir,
 * dans l'ordre de la carte « À répartir ». Vide quand le jour n'a aucune
 * tournée enregistrée — c'est « Proposer » qui compose alors.
 */
export interface DeliveryPlacementSuggestionsView {
  readonly day: string;
  readonly suggestions: readonly DeliveryPlacementSuggestionView[];
}
