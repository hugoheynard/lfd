import { createHash } from "node:crypto";

import type { CreditorSnapshot } from "../creditor-snapshot.js";
import type { CollectionBatchLine } from "../entities/collection-batch.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import type { BillingCycle } from "./billing-cycle.js";
import type { DebitDraft } from "./collection-assembly.js";
import { batchSepaIdentifiers } from "./collection-identifiers.js";
import { draftBanner } from "./pain008.js";
import {
  cyclePeriod,
  renderPain008Document,
  sequenceTypeOf,
  type DocumentDebit,
} from "./pain008-document.js";

export interface BatchFileInput {
  readonly batchId: string;
  readonly creditor: CreditorSnapshot;
  readonly scheme: SepaScheme;
  readonly cycle: BillingCycle;
  /** `CreDtTm` — l'instant de la constitution, jamais celui d'un téléchargement. */
  readonly constitutedAt: Date;
  /** Dans l'ordre des rangs (`assembleCollection` les rend ainsi). */
  readonly debits: readonly DebitDraft[];
  readonly unmandatedCompanies: readonly string[];
}

export interface BatchFile {
  readonly lines: readonly CollectionBatchLine[];
  readonly xml: string;
  readonly sha256: string;
}

/**
 * **Le fichier d'un lot**, rendu UNE fois à sa constitution puis stocké (plan
 * §2 ; trouvailles T16, T17).
 *
 * Les lignes et le XML sortent du même parcours : le rang d'une ligne EST
 * celui de son `EndToEndId` dans le fichier. Un lot qui nomme une société sans
 * mandat porte le bandeau du brouillon — il n'est pas déposable (Q2), et son
 * fichier le crie comme l'aperçu.
 */
export function renderBatchFile(input: BatchFileInput): BatchFile {
  const ids = batchSepaIdentifiers(input.batchId);
  const period = cyclePeriod(input.cycle.startsAt, input.cycle.closesAt);
  const lines = input.debits.map((debit, index): CollectionBatchLine => {
    const rank = index + 1;
    return {
      rank,
      endToEndId: ids.endToEndIdOf(rank),
      mandateId: debit.mandate.mandateId,
      mandateReference: debit.mandate.reference,
      mandateSignedAt: debit.mandate.signedAt,
      debtorCompanyId: debit.payerId,
      debtorName: debit.debtorName,
      debtorIban: debit.mandate.iban,
      debtorBic: debit.mandate.bic,
      sequence: sequenceTypeOf(debit.mandate.paymentType),
      amountCents: debit.amountCents,
      ordersTotalCents: debit.ordersTotalCents,
      orderIds: debit.orders.map((order) => order.orderId),
      priorOrderCount: debit.priorOrderCount,
    };
  });
  const documentDebits = input.debits.map((debit, index): DocumentDebit => ({
    endToEndId: ids.endToEndIdOf(index + 1),
    debtorName: debit.debtorName,
    amountCents: debit.amountCents,
    mandate: debit.mandate,
    remittance: remittanceOf(period, debit),
  }));
  const depositable = lines.length > 0 && input.unmandatedCompanies.length === 0;
  const xml = renderPain008Document({
    creditor: input.creditor,
    scheme: input.scheme,
    messageId: ids.messageId,
    paymentInfoIdOf: ids.paymentInfoIdOf,
    createdAt: input.constitutedAt,
    cycleEnd: input.cycle.closesAt,
    banner: depositable ? null : draftBanner(input.unmandatedCompanies, lines.length === 0),
    debits: documentDebits,
  });
  return { lines, xml, sha256: sha256Of(xml) };
}

/** L'empreinte d'un fichier stocké — vérifiée à chaque téléchargement. */
export function sha256Of(xml: string): string {
  return createHash("sha256").update(xml, "utf8").digest("hex");
}

/** « Commandes du … (12), dont 3 de cycles anterieurs » — §3. */
function remittanceOf(period: string, debit: DebitDraft): string {
  const base = `Commandes du ${period} (${String(debit.orders.length)})`;
  return debit.priorOrderCount === 0
    ? base
    : `${base}, dont ${String(debit.priorOrderCount)} de cycles anterieurs`;
}
