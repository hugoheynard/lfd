import type { OccurrenceRefusalCause } from "../../occurrence/domain/refusal-cause.js";
import type { OccurrencePlacementRequest } from "./occurrence-placement.js";

/** **Une colonne planifiée à passer**, avec tout ce que la commande reprend. */
export interface PlannedColumnPlacementRequest {
  /** La colonne : la provenance de la commande (`from_planned_column_id`), unique. */
  readonly columnId: string;
  /** Le jour servi, `AAAA-MM-JJ`. */
  readonly serviceDay: string;
  /** Celui qui a écrit la colonne en dernier : l'acheteur de la commande. */
  readonly buyerUserId: string;
  readonly companyId: string;
  readonly routing: OccurrencePlacementRequest["routing"];
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
}

/** Ce que le commerce a fait de la colonne : passée (sa commande), ou refusée. */
export type PlannedColumnPlacementOutcome =
  | { readonly kind: "placed"; readonly orderId: string; readonly orderNumber: string }
  | {
      readonly kind: "refused";
      readonly cause: OccurrenceRefusalCause;
      readonly reason: string;
    };

/**
 * **« Passe cette colonne »** — déclaré par le planificateur, implémenté par
 * le commerce avec la passation même d'une échéance de panier récurrent
 * (plan du planificateur, § 5) : mur sur l'acheteur, porte de la boutique,
 * composition sans passe-droit, règlement au compte. Le port est frère de
 * `OccurrencePlacement` parce que sa demande n'a ni panier, ni écart au
 * gabarit, ni CGV imposées : la colonne fige les CGV en vigueur, comme un
 * client qui clique « Commander ».
 *
 * **Une colonne, au plus une commande** — tenu par le commerce, en base
 * (index unique sur la provenance). Une seconde passation de la même colonne
 * rend la commande déjà passée, comme `placed` : un rejeu, pas un doublon.
 *
 * Un refus métier se rend, il ne se lève pas ; une erreur technique se lève,
 * et le balayage suivant réessaie.
 */
export abstract class PlannedColumnPlacement {
  abstract place(request: PlannedColumnPlacementRequest): Promise<PlannedColumnPlacementOutcome>;
}
