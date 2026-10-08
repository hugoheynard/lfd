import { instantToLocal } from "@lfd/contracts";

import type { CreditorSnapshot } from "../domain/creditor-snapshot.js";
import {
  BillingStatement,
  statementSellerOf,
  type StatementBuyer,
} from "../domain/entities/billing-statement.js";
import type { CollectionBatch } from "../domain/entities/collection-batch.js";
import { StatementBuyerMissingError } from "../domain/errors/billing-statement-errors.js";
import type { DebitDraft } from "../domain/services/collection-assembly.js";
import type { SepaScheme } from "../domain/value-objects/sepa-scheme.js";

export interface StatementsInput {
  readonly batches: readonly CollectionBatch[];
  /** Les lignes à venir, par schéma, dans l'ordre des rangs (`assembleCollection`). */
  readonly debits: ReadonlyMap<SepaScheme, readonly DebitDraft[]>;
  readonly creditor: CreditorSnapshot;
  readonly buyers: ReadonlyMap<string, StatementBuyer>;
  readonly at: Date;
  readonly nextId: () => string;
}

/** Une ligne de débit et son arrêté, pour le journal. */
export interface IssuedStatement {
  readonly batch: CollectionBatch;
  readonly statement: BillingStatement;
  readonly debtorName: string;
}

/**
 * **Un arrêté par ligne de débit d'arrêté** (plan
 * `le-prelevement-suit-la-facture.md`), avec exactement les bons de
 * la ligne. Une ligne qui encaisse des factures émises n'en reçoit pas : sa
 * pièce est la facture (plan `plan-emission-de-la-facture.md`, E4).
 *
 * Le rang d'une ligne EST l'indice de son brouillon + 1 (`renderBatchFile`) :
 * on relit donc les brouillons du schéma du lot, dans le même ordre. La
 * facture vient du brouillon, calculée une seule fois par `assembleCollection`.
 */
export function buildStatements(input: StatementsInput): readonly IssuedStatement[] {
  const issuedOn = instantToLocal(input.at).day;
  const seller = statementSellerOf(input.creditor);
  return input.batches.flatMap((batch) => {
    const state = batch.toPersistence();
    const drafts = input.debits.get(state.scheme) ?? [];
    return state.lines.flatMap((line): IssuedStatement[] => {
      const draft = drafts[line.rank - 1];
      if (draft?.settles.kind === "invoices") {
        return [];
      }
      const buyer = input.buyers.get(line.debtorCompanyId);
      if (draft === undefined || buyer === undefined) {
        throw new StatementBuyerMissingError(batch.id, line.rank, line.debtorCompanyId);
      }
      const statement = BillingStatement.issue({
        id: input.nextId(),
        batchId: batch.id,
        lineRank: line.rank,
        legalEntityId: state.legalEntityId,
        payerCompanyId: line.debtorCompanyId,
        seller,
        buyer,
        issuedOn,
        orders: draft.orders.map((order) => ({ orderId: order.orderId, frozen: order.frozen })),
        invoice: draft.settles.invoice,
        ordersTotalCents: draft.ordersTotalCents,
        lineAmountCents: line.amountCents,
      });
      return [{ batch, statement, debtorName: line.debtorName }];
    });
  });
}
