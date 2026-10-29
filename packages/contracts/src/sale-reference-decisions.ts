/**
 * Les familles de décisions tarifaires qui nomment une référence de vente.
 * Des VALEURS de donnée : le back-office les traduit en libellés.
 */
export type SaleReferenceDecisionKind =
  | "mercuriale"
  | "price_rule"
  | "price_floor"
  | "volume_ladder"
  | "volume_commitment"
  | "price_template";

/**
 * Une décision tarifaire EN VIGUEUR (ou programmée) qui vise une référence de
 * vente — `GET admin/pricing/sale-references/:sku/decisions`
 * (`documentation/catalogue/plan-pro-voit-les-declinaisons.md`, L7).
 *
 * Sert la fiche née d'un détachement : les décisions restées sur l'ancienne
 * référence ne la suivent pas (modèle à plat), et le staff choisit de les
 * reposer ou non.
 */
export interface SaleReferenceDecisionView {
  readonly kind: SaleReferenceDecisionKind;
  readonly id: string;
  readonly label: string;
  /** La société visée nommément, `null` pour une décision ouverte à tous. */
  readonly companyId: string | null;
  /** Son nom d'écran, `null` sans société ou si elle a disparu. */
  readonly companyName: string | null;
  /** ISO 8601 ; `null` pour un gabarit, qui n'a pas de fenêtre. */
  readonly validFrom: string | null;
  readonly validTo: string | null;
  /** En pause : debout, mais ne joue pas aujourd'hui. */
  readonly paused: boolean;
}
