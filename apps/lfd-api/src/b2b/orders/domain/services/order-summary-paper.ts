import {
  type CompanyOrderSummaryView,
  instantToLocal,
  type OrderSummaryBottomView,
  type OrderSummaryExclusionReason,
} from "@lfd/contracts";

import type { OrderSummaryPeriod } from "./order-summary-period.js";

/**
 * **Ce que le PDF et le tableur du récapitulatif disent en commun** (plan
 * `documentation/commandes/plan-recapitulatif-des-commandes.md`, lot R2) — les
 * mots, l'ordre du bas, le nom du fichier. Les deux rendus en dérivent : un
 * libellé changé ici change aux deux endroits, et ils ne se contredisent pas.
 */

/** Tout ce qu'un rendu lit : le récapitulatif DÉJÀ calculé, jamais une relecture. */
export interface OrderSummaryPaper {
  readonly summary: CompanyOrderSummaryView;
  /** La société au nom de qui le récapitulatif est demandé (celle de l'URL). */
  readonly requesterName: string;
  /** L'instant du rendu, lu au `Clock`. */
  readonly generatedAt: Date;
  /**
   * Les bornes du filtre affiché à la sélection (§9) — imprimées, jamais
   * relues contre les commandes ; `null` : aucune borne posée.
   */
  readonly period: OrderSummaryPeriod | null;
}

export const SUMMARY_TITLE = "Récapitulatif de commandes — montants à la commande";

/** §6.4 : ce que les montants ne sont pas. */
export const SUMMARY_SCOPE_NOTE =
  "Montants à la commande : remboursements et avoirs postérieurs non déduits. " +
  "Le relevé comptable, ce sont les factures.";

export const TOTAL_LABEL = "Total général";

const EXCLUSION_LABELS: Readonly<Record<OrderSummaryExclusionReason, string>> = {
  cancelled: "annulée",
  payment_pending: "paiement en attente",
  payment_failed: "paiement refusé",
};

/** Pourquoi une commande sélectionnée est hors des totaux, en mots. */
export function exclusionLabel(reason: OrderSummaryExclusionReason): string {
  return EXCLUSION_LABELS[reason];
}

/** Combien de commandes on a demandées : comptées + exclues. */
export function selectedCount(summary: CompanyOrderSummaryView): number {
  return summary.total.orderCount + summary.excluded.length;
}

/** « Sélection de 12 commandes — 10 comptées, 2 exclues ». */
export function selectionSentence(summary: CompanyOrderSummaryView): string {
  const selected = selectedCount(summary);
  return (
    `Sélection de ${String(selected)} commande${selected > 1 ? "s" : ""} — ` +
    `${String(summary.total.orderCount)} comptée${summary.total.orderCount > 1 ? "s" : ""}, ` +
    `${String(summary.excluded.length)} exclue${summary.excluded.length > 1 ? "s" : ""}`
  );
}

/** Une ligne du bas, en centimes signés comme on les lit sur une facture. */
export interface SummaryBottomRow {
  readonly label: string;
  readonly cents: number;
  /** Un geste qui n'a pas eu lieu (0) peut être tu à l'impression. */
  readonly optional: boolean;
  readonly strong: boolean;
}

/** `5.5` → « 5,5 % ». */
export function vatRateLabel(rate: number): string {
  return `${String(rate).replace(".", ",")} %`;
}

/**
 * Le bas, dans l'ordre d'une facture (§6.1) : sous-total HT, remises, bons,
 * livraison, surtaxes, la TVA par taux, la TVA non ventilée s'il y en a, et
 * le TTC. Chaque montant est la somme déjà faite par le domaine — aucun calcul
 * ici, sinon le signe des déductions.
 */
export function summaryBottomRows(bottom: OrderSummaryBottomView): readonly SummaryBottomRow[] {
  const row = (label: string, cents: number, optional = true): SummaryBottomRow => ({
    label,
    cents,
    optional,
    strong: false,
  });
  return [
    row("Sous-total HT", bottom.subtotalCents, false),
    row("Remises", -bottom.discountCents),
    row("Bons de fidélité", -bottom.voucherDiscountCents),
    row("Livraison", bottom.deliveryFeeCents),
    row("Surtaxes de commande tardive", bottom.lateFeeCents),
    ...bottom.vat.map((share) => row(`TVA ${vatRateLabel(share.rate)}`, share.amountCents, false)),
    row("dont TVA non ventilée", bottom.unventilatedVatCents),
    { label: "Total TTC", cents: bottom.totalCents, optional: false, strong: true },
  ];
}

/** « Café du Port & Fils » → `cafe-du-port-fils`. */
function slugOf(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug === "" ? "societe" : slug;
}

/** `recapitulatif-<société>-<AAAA-MM-JJ>.<ext>` — le jour de Paris du rendu. */
export function orderSummaryFileName(paper: OrderSummaryPaper, extension: "pdf" | "csv"): string {
  const day = instantToLocal(paper.generatedAt).day;
  return `recapitulatif-${slugOf(paper.requesterName)}-${day}.${extension}`;
}
