import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/** Une ligne d'un réassort : l'article, son nom, la quantité demandée. Aucun prix. */
export interface PlacedResupplyLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Un réassort envoyé « pour demain » à un point, tel que le fournil le figera. */
export interface PlacedResupply {
  /** L'identifiant du réassort au commerce, opaque. */
  readonly resupplyId: string;
  /** Le point qui le recevra, opaque. */
  readonly siteId: string;
  /** Son nom, pour la feuille ; `null` : inconnu du commerce. */
  readonly siteLabel: string | null;
  readonly lines: readonly PlacedResupplyLine[];
}

/**
 * **« Quels réassorts sont envoyés pour cette journée ? »** — port que le
 * fournil DÉCLARE et que le commerce implémente (lot R3a,
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md` §13.1 point 1).
 *
 * Un canal À PART de {@link DayOrdersReader} : un réassort n'a ni client, ni
 * mode d'acheminement, ni bon — le mêler à `ProducibleOrder` obligerait à
 * inventer ces champs. Seuls les réassorts « pour demain », envoyés et non
 * annulés ; « au plus tôt » n'entre pas au plan (R4).
 *
 * L'arrêt du plan le lit SOUS le verrou de la journée : l'envoi et
 * l'annulation d'un réassort pour demain prennent le même verrou
 * (`PlanAdmissionDesk`), donc l'arrêt voit tout ce qui a été admis, et rien
 * ne change après lui.
 */
export abstract class DayResuppliesReader {
  abstract placedFor(day: ServiceDay): Promise<readonly PlacedResupply[]>;
}
