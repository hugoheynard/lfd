/** Les familles de décisions qui nomment une référence de vente — des VALEURS. */
export type StandingDecisionKind =
  | "mercuriale"
  | "price_rule"
  | "price_floor"
  | "volume_ladder"
  | "volume_commitment"
  | "price_template";

/** Une décision debout sur une référence, telle que la table la range. */
export interface StandingDecision {
  readonly kind: StandingDecisionKind;
  readonly id: string;
  readonly label: string;
  /** La société visée nommément ; `null` = ouverte à tous. */
  readonly companyId: string | null;
  /** `null` pour un gabarit, qui n'a pas de fenêtre. */
  readonly validFrom: Date | null;
  readonly validTo: Date | null;
  readonly paused: boolean;
}

/**
 * Port de **lecture** : les décisions tarifaires EN VIGUEUR ou programmées qui
 * visent une référence de vente (`plan-pro-voit-les-declinaisons.md`, L7).
 *
 * « Debout » = non archivée, et dont la fenêtre n'est pas close à `at` — une
 * décision en pause en est (elle reprendra), une décision expirée non. Le
 * modèle est à plat : une décision ne vaut que pour la référence qu'elle
 * nomme, et une fiche née d'un détachement n'hérite d'aucune de celles de
 * l'ancienne. C'est cette liste qui le dit au staff.
 *
 * Distinct de `PricingDecisionsReader` (ISP) : celui-là lit tout pour un
 * écran de tableau ; celui-ci répond sur UNE référence, toutes familles.
 */
export abstract class SaleReferenceDecisionsReader {
  abstract standingOn(saleReference: string, at: Date): Promise<readonly StandingDecision[]>;
}
