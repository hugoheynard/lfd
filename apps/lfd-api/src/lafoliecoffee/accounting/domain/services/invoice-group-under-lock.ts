import {
  sameBudgetCommitment,
  type InvoiceBudgetCommitment,
} from "../value-objects/invoice-budget-commitment.js";
import type { InvoiceableOrder, PayerInvoicePlan } from "./monthly-invoicing.js";

/**
 * Le groupe d'une facture **relu sous le verrou** de ses lignes `orders`,
 * juste avant son numéro : ce qui a bougé depuis la préparation en sort.
 */

/**
 * **Le groupe d'une facture, moins ses commandes annulées** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C5.3), relu sous le verrou des
 * lignes `orders` du groupe. On retire, rien d'autre : le mandat effectif se
 * calcule bon par bon (`effectiveMandateOf`), retirer un bon ne change donc
 * ni le mandat ni la clé des autres — replanifier rendrait le même groupe.
 * `null` : plus aucun bon, rien à émettre ni à signaler.
 *
 * Par NUMÉRO de commande : c'est ce que rend `CancelledOrdersReader`, écrit
 * pour nommer le refus du dépôt (vérifié le 2026-10-12) ; un numéro est
 * unique.
 */
export function withoutCancelled(
  group: PayerInvoicePlan,
  cancelledNumbers: ReadonlySet<string>,
): PayerInvoicePlan | null {
  const live = (order: InvoiceableOrder): boolean => !cancelledNumbers.has(order.orderNumber);
  const billable = group.billable.filter(live);
  const unbillable = group.unbillable.filter(live);
  if (billable.length === 0 && unbillable.length === 0) {
    return null;
  }
  return { ...group, billable, unbillable };
}

/**
 * **Le groupe d'une facture, moins les bons dont l'engagement a changé**
 * (E4″), relu sous le même verrou que les annulations : un engagement corrigé
 * entre la préparation et l'émission sort le bon de cette facture — il part
 * avec celle de son nouvel engagement, à cette clôture rejouée ou à la
 * suivante. Un bon absent de `current` (plus relu) est gardé : c'est
 * `withoutCancelled` qui juge les disparitions. `null` : plus aucun bon.
 */
export function withoutMovedCommitments(
  group: PayerInvoicePlan,
  current: ReadonlyMap<string, InvoiceBudgetCommitment | null>,
): PayerInvoicePlan | null {
  const stays = (order: InvoiceableOrder): boolean => {
    const now = current.get(order.orderId);
    return now === undefined || sameBudgetCommitment(now, group.budgetCommitment);
  };
  const billable = group.billable.filter(stays);
  const unbillable = group.unbillable.filter(stays);
  if (billable.length === 0 && unbillable.length === 0) {
    return null;
  }
  return { ...group, billable, unbillable };
}

/** Tous les bons d'un groupe — ceux que l'émission verrouille. */
export function groupOrderIds(group: PayerInvoicePlan): readonly string[] {
  return [...group.billable, ...group.unbillable].map((order) => order.orderId);
}
