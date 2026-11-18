import { isPublicLegalForm, toLegalForm } from "@lfd/contracts";

import type { InvoiceBuyerFacts, InvoiceIssuanceBlocker } from "./invoice-issuance-blockers.js";

/**
 * Comment la facture demande d'être réglée, réduit à ce que le filet du payeur
 * public juge : `"transfer"` (virement), `"card"` (déjà payée), ou
 * `"other"` (prélèvement, ou aucun moyen nommé).
 */
export type InvoiceSettlementKind = "transfer" | "card" | "other";

/**
 * **Une facture publique ne s'émet jamais au prélèvement** : un organisme
 * public règle par virement. L'activation pose le virement chez chaque
 * entité en service ; ce filet couvre l'entité ouverte après, et tout chemin
 * qui l'aurait oublié — sans facture émise, rien n'entre dans un lot.
 *
 * Une facture carte, déjà acquittée, n'appelle aucun paiement : elle n'est
 * pas retenue ici (la carte est refusée à la passation).
 */
export function publicPayerMeansBlockers(
  buyer: Pick<InvoiceBuyerFacts, "name" | "legalForm"> | null,
  settlement: InvoiceSettlementKind,
): readonly InvoiceIssuanceBlocker[] {
  if (buyer === null || settlement !== "other" || !isPublicForm(buyer.legalForm)) {
    return [];
  }
  return [
    {
      code: "public_payer_not_on_transfer",
      message:
        `Le client « ${buyer.name} » est un organisme public : il règle par virement. Posez le ` +
        "virement comme moyen d'encaissement chez cette entité (fiche client, moyen " +
        "d'encaissement), puis relancez la facture.",
    },
  ];
}

function isPublicForm(legalForm: string): boolean {
  const form = toLegalForm(legalForm);
  return form !== null && isPublicLegalForm(form);
}
