import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import type { AssemblyInput, DebitDraft, DebitGroup } from "./collection-assembly.js";
import { simulateInvoiceDossier } from "./invoice-dossier.js";
import { SEQUENCE_ORDER, sequenceTypeOf } from "./pain008-document.js";

/**
 * **Les lignes à venir d'un assemblage** — sorties de `collection-assembly.ts`
 * pour qu'il reste lisible : par schéma, dans l'ordre des rangs ; le montant
 * d'une ligne de factures est Σ de leurs TTC (E4), celui d'une ligne d'arrêté
 * le TTC de la facture calculée UNE fois sur ses bons (F2).
 */

export function debitsByScheme(
  groups: readonly DebitGroup[],
  input: AssemblyInput,
): ReadonlyMap<SepaScheme, readonly DebitDraft[]> {
  const drafts = groups.map((group) => draftOf(group, input));
  const result = new Map<SepaScheme, readonly DebitDraft[]>();
  for (const scheme of ["CORE", "B2B"] as const) {
    const ofScheme = drafts.filter((draft) => draft.mandate.scheme === scheme);
    if (ofScheme.length > 0) {
      result.set(scheme, inRankOrder(ofScheme));
    }
  }
  return result;
}

function draftOf(group: DebitGroup, input: AssemblyInput): DebitDraft {
  const orders = [...group.orders].sort((left, right) =>
    left.orderNumber.localeCompare(right.orderNumber),
  );
  const ordersTotalCents = orders.reduce((sum, order) => sum + order.totalCents, 0);
  const common = {
    payerId: group.payerId,
    debtorName: nameOf(group.payerId, input.companyNames),
    mandate: group.mandate,
    orders,
    priorOrderCount: orders.filter((order) => order.placedAt < input.cycleStartsAt).length,
  };
  if (group.invoices !== null) {
    const invoices = [...group.invoices].sort((left, right) =>
      left.number.localeCompare(right.number),
    );
    return {
      ...common,
      settles: { kind: "invoices", invoices },
      amountCents: invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
      ordersTotalCents,
    };
  }
  const dossier = simulateInvoiceDossier(orders.map((order) => order.frozen));
  return {
    ...common,
    settles: { kind: "statement", invoice: dossier.invoice },
    amountCents: dossier.invoice.totalCents,
    ordersTotalCents: dossier.ordersTotalCents,
  };
}

/** RCUR puis OOFF (l'ordre des blocs du fichier), puis par nom, puis par id. */
function inRankOrder(drafts: readonly DebitDraft[]): readonly DebitDraft[] {
  const byName = [...drafts].sort(
    (left, right) =>
      left.debtorName.localeCompare(right.debtorName, "fr") ||
      left.payerId.localeCompare(right.payerId),
  );
  return SEQUENCE_ORDER.flatMap((sequence) =>
    byName.filter((draft) => sequenceTypeOf(draft.mandate.paymentType) === sequence),
  );
}

/** Le nom du payeur ; son id si l'annuaire ne le connaît pas — jamais un nom inventé. */
export function nameOf(companyId: string, names: ReadonlyMap<string, string>): string {
  return names.get(companyId) ?? companyId;
}
