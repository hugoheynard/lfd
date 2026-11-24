import type { PayerInvoicePlan } from "./monthly-invoicing.js";
import type { PayerCommitmentSheet } from "./public-commitment-blocker.js";

/** Le plan d'une clôture partagé entre devis et factures. */
export interface PeriodQuoteSplit {
  /** Les groupes rangés en devis : leurs seules commandes facturables. */
  readonly toQuote: readonly PayerInvoicePlan[];
  /**
   * Les groupes à émettre comme aujourd'hui — et, pour un groupe mis en
   * devis, ce qui n'y entre pas (non facturables, bons non soldés), que
   * l'émission signale comme elle le fait déjà.
   */
  readonly toIssue: readonly PayerInvoicePlan[];
}

/**
 * **La mise à part des devis de période** (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, v5 B3 et B4), faite APRÈS
 * `planMonthlyInvoices` : les groupes n'existent qu'une fois le plan fait.
 *
 * Un groupe va en devis quand son payeur donne son numéro sur le devis
 * (`timing = on_period_quote`) et que ses commandes n'en portent pas — un
 * groupe qui en porte un (commande passée avant le changement de mode, ou
 * numéro reçu) s'émet comme aujourd'hui. Seules ses commandes facturables
 * entrent au devis ; les autres (sans taux, incohérentes, en attente d'un
 * reste) restent sur le chemin d'aujourd'hui, pour ne pas finir coincées dans
 * un devis facturé. Un bon **non soldé** (`settlement = unsettled`) est rangé
 * par le plan parmi les facturables, mais sa facture ne part pas (bloqueur
 * `order_unsettled`) : il ne ferait que bloquer l'engagement du devis, il
 * reste donc lui aussi sur le chemin d'aujourd'hui, qui le nomme. Un groupe
 * sans rien à mettre en devis n'en fait pas.
 *
 * L'ordre des groupes est gardé : la numérotation reste déterministe.
 */
export function splitForPeriodQuotes(
  invoices: readonly PayerInvoicePlan[],
  sheets: ReadonlyMap<string, PayerCommitmentSheet>,
): PeriodQuoteSplit {
  const toQuote: PayerInvoicePlan[] = [];
  const toIssue: PayerInvoicePlan[] = [];
  for (const group of invoices) {
    const quotable = group.billable.filter((order) => order.settlement !== "unsettled");
    if (!awaitsQuote(group, sheets) || quotable.length === 0) {
      toIssue.push(group);
      continue;
    }
    toQuote.push({ ...group, billable: quotable, unbillable: [] });
    const unsettled = group.billable.filter((order) => order.settlement === "unsettled");
    if (unsettled.length > 0 || group.unbillable.length > 0) {
      toIssue.push({ ...group, billable: unsettled });
    }
  }
  return { toQuote, toIssue };
}

function awaitsQuote(
  group: PayerInvoicePlan,
  sheets: ReadonlyMap<string, PayerCommitmentSheet>,
): boolean {
  return (
    sheets.get(group.payerId)?.timing === "on_period_quote" &&
    (group.budgetCommitment?.number ?? "") === ""
  );
}
