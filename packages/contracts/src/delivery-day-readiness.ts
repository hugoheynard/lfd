/**
 * **Le plan arrêté, vu par l'écran des tournées** (plan de composition
 * automatique, §16.5, CA6a) — `GET /admin/livraison/tournees/plan-arrete?jour=`,
 * sous `delivery_rounds:read`.
 *
 * Trois états : `arrested` nul (le plan n'est pas arrêté : rien à dire),
 * arrêté (« Plan arrêté — N livraisons, dont P hors tournée »), arrêté sans
 * socle de composition (`compositionGap` posé : proposer refuserait).
 */
export interface DeliveryDayReadinessView {
  /** Jour de service, `AAAA-MM-JJ`. */
  readonly day: string;
  readonly arrested: DeliveryDayArrestView | null;
}

/** Ce que la livraison sait d'un plan arrêté. */
export interface DeliveryDayArrestView {
  /** L'instant de l'arrêt, ISO 8601. */
  readonly closedAt: string;
  /** Les livraisons que les clôtures ont apprises à la livraison. */
  readonly deliveryCount: number;
  /** Celles d'entre elles qu'aucune tournée du jour ne porte encore. */
  readonly unplacedCount: number;
  /** Ce qui manque pour proposer (CA-D3), ou `null`. */
  readonly compositionGap: DeliveryCompositionGap | null;
  /**
   * Le jour est-il imminent, à l'heure de Paris : `today`, `tomorrow`, ou
   * `null` plus loin. Avec `unplacedCount > 0`, l'écran passe en alerte
   * (« Demain : N livraisons hors tournée », composition automatique §5).
   */
  readonly due: DeliveryDayDue | null;
}

/** Le jour de livraison est aujourd'hui, ou demain. */
export type DeliveryDayDue = "today" | "tomorrow";

/** Aucun véhicule en service n'a ses cotes ; aucun type de bac n'est en service. */
export type DeliveryCompositionGap = "no_measured_vehicle" | "no_active_bin_type";
