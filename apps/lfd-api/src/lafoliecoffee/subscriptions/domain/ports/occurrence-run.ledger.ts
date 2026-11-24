import type { IsoDate } from "../value-objects/iso-date.js";

/**
 * Les causes stables d'une échéance non générée. Le code se lit par machine
 * (« même cause qu'au balayage précédent ? ») ; la phrase, par le staff.
 */
export type OccurrenceRefusalCause =
  | "buyer_left"
  | "deadline_closed"
  | "item_limit_exceeded"
  | "reserved_elsewhere"
  | "unavailable_sku"
  | "day_closed"
  | "plan_closed"
  | "no_settlement"
  | "no_window"
  | "shop_closed"
  /** Un autre refus métier de la passation : sa phrase dit le cas. */
  | "order_refused";

/** Ce que le planificateur a fait d'une échéance. */
export type OccurrenceRunOutcome =
  | { readonly kind: "generated"; readonly orderId: string }
  | {
      readonly kind: "refused";
      readonly cause: OccurrenceRefusalCause;
      readonly reason: string;
    }
  | {
      readonly kind: "missed_deadline";
      /** La dernière cause connue, ou `deadline_closed` si l'échéance n'a jamais été tentée. */
      readonly cause: OccurrenceRefusalCause;
      readonly reason: string;
    };

/** Une inscription au registre. */
export interface OccurrenceRunEntry {
  readonly subscriptionId: string;
  readonly date: IsoDate;
  readonly outcome: OccurrenceRunOutcome;
  readonly at: Date;
}

/**
 * Ce que l'inscription a changé : `written` est faux quand l'échéance était
 * déjà close (générée ou manquée) et que rien n'a été réécrit ; `newCause`
 * est vrai quand un refus inscrit une cause différente de la précédente —
 * c'est le seul moment où l'alerte staff repart.
 */
export interface OccurrenceRunRecorded {
  readonly written: boolean;
  readonly newCause: boolean;
}

/** L'état d'une échéance au registre. */
export interface OccurrenceRunState {
  readonly date: IsoDate;
  readonly outcome: OccurrenceRunOutcome["kind"];
  readonly cause: OccurrenceRefusalCause | null;
}

/**
 * **Le registre des échéances**, déclaré par le contexte des paniers et
 * écrit par lui seul (plan du planificateur, § 5). Une ligne par (panier,
 * jour) :
 *
 * - `generated` et `missed_deadline` sont **définitifs** : une inscription
 *   suivante n'y change rien (`written: false`) — c'est ce qui fait qu'un
 *   balayage rejoué ne passe jamais deux commandes pour une échéance ;
 * - `refused` se **réécrit** tant que l'échéance n'est pas close : le
 *   staff qui corrige la cause voit l'échéance repartir au balayage suivant.
 *
 * Appelé dans l'unité de travail de la passation : la commande et sa ligne
 * au registre partent ensemble, ou aucune ne part.
 */
export abstract class OccurrenceRunLedger {
  abstract record(entry: OccurrenceRunEntry): Promise<OccurrenceRunRecorded>;

  /** Les échéances inscrites d'un panier entre deux jours, bornes comprises. */
  abstract runsBetween(
    subscriptionId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<readonly OccurrenceRunState[]>;
}
