import type { CreditorSnapshot } from "../domain/creditor-snapshot.js";
import type { CollectionBatch } from "../domain/entities/collection-batch.js";
import type { CollectionNotice } from "../domain/entities/collection-notice.js";
import type { NoticeLine } from "../domain/services/collection-notice-plan.js";
import { planNotices } from "../domain/services/collection-notice-plan.js";
import type { CycleNoticesReader } from "../domain/ports/cycle-notices.reader.js";
import type { PayerNoticeContactsReader } from "../domain/ports/payer-notice-contacts.reader.js";
import type { IssuedStatement } from "./billing-statement-support.js";

export interface NoticeReaders {
  readonly earlier: CycleNoticesReader;
  readonly contacts: PayerNoticeContactsReader;
}

export interface NoticeConstitution {
  readonly legalEntityId: string;
  readonly creditor: CreditorSnapshot;
  readonly cycleClosesAt: Date;
  readonly batches: readonly CollectionBatch[];
  readonly issued: readonly IssuedStatement[];
  readonly at: Date;
  readonly nextId: () => string;
}

/**
 * **Les avis d'une constitution** (PA2) : lit les avis déjà écrits pour ce
 * cycle et les adresses des payeurs, puis laisse le domaine décider —
 * premier avis, rectificatif, reconduction, annulation. Rien n'est écrit ici.
 *
 * L'échéance annoncée est celle que les lots ont figée : tous les lots d'un
 * cycle portent la même (`buildBatches`).
 */
export async function noticesOf(
  readers: NoticeReaders,
  input: NoticeConstitution,
): Promise<readonly CollectionNotice[]> {
  const lines = noticeLinesOf(input.batches, input.issued);
  const earlier = await readers.earlier.ofCycle(input.legalEntityId, input.cycleClosesAt);
  const debtors = [
    ...new Set([
      ...lines.map((line) => line.debtorCompanyId),
      ...earlier.map((entry) => entry.notice.toPersistence().debtorCompanyId),
    ]),
  ];
  const collectionDay = input.batches[0]?.toPersistence().requestedCollectionDay ?? null;
  if (collectionDay === null) {
    // Aucun lot (rien qu'écarté) : on n'annonce rien, et on n'annule rien —
    // une annulation ne part qu'avec une reconstitution qui prélève.
    return [];
  }
  return planNotices({
    legalEntityId: input.legalEntityId,
    cycleClosesAt: input.cycleClosesAt,
    collectionDay,
    creditor: { name: input.creditor.name, ics: input.creditor.ics },
    lines,
    earlier,
    contacts: await readers.contacts.contactsOf(debtors),
    at: input.at,
    nextId: input.nextId,
  });
}

/** Chaque ligne de débit, avec la référence de son arrêté ou de ses factures (E4). */
function noticeLinesOf(
  batches: readonly CollectionBatch[],
  issued: readonly IssuedStatement[],
): readonly NoticeLine[] {
  const statementOf = new Map(
    issued.map(({ statement }) => {
      const state = statement.toPersistence();
      return [`${state.batchId}:${state.lineRank}`, state.id] as const;
    }),
  );
  return batches.flatMap((batch) =>
    batch.lines.flatMap((line): NoticeLine[] => {
      const statementId = statementOf.get(`${batch.id}:${line.rank}`) ?? null;
      const invoiceNumbers = line.invoices.map((invoice) => invoice.number);
      // Inatteignable : `buildStatements` émet un arrêté par ligne d'arrêté, ou lève.
      if (statementId === null && invoiceNumbers.length === 0) {
        return [];
      }
      return [
        {
          ref: { batchId: batch.id, lineRank: line.rank, statementId, invoiceNumbers },
          debtorCompanyId: line.debtorCompanyId,
          debtorName: line.debtorName,
          amountCents: line.amountCents,
          mandateReference: line.mandateReference,
        },
      ];
    }),
  );
}
