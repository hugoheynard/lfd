import type { CreditorSnapshot } from "../domain/creditor-snapshot.js";
import type { CollectionBatch } from "../domain/entities/collection-batch.js";
import type { CollectionNotice } from "../domain/entities/collection-notice.js";
import type { NoticeLine } from "../domain/services/collection-notice-plan.js";
import { planCancellations, planNotices } from "../domain/services/collection-notice-plan.js";
import type { CycleNoticesReader } from "../domain/ports/cycle-notices.reader.js";
import type { PayerNoticeContactsReader } from "../domain/ports/payer-notice-contacts.reader.js";
import type { RepresentedRejectionsReader } from "../domain/ports/represented-rejections.reader.js";
import type { IssuedStatement } from "./billing-statement-support.js";

export interface NoticeReaders {
  readonly earlier: CycleNoticesReader;
  readonly contacts: PayerNoticeContactsReader;
  /** Le rejet qu'une ligne re-présente — l'avis le dit (retours bancaires, § 2 bis-6). */
  readonly rejections: RepresentedRejectionsReader;
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
 * premier avis, rectificatif, reconduction, annulation — y compris quand
 * aucun lot ne naît (annulations seules). Rien n'est écrit ici.
 *
 * L'échéance annoncée est celle que les lots ont figée : tous les lots d'un
 * cycle portent la même (`buildBatches`).
 */
export async function noticesOf(
  readers: NoticeReaders,
  input: NoticeConstitution,
): Promise<readonly CollectionNotice[]> {
  const invoiceIds = input.batches.flatMap((batch) =>
    batch.lines.flatMap((line) => line.invoices.map((invoice) => invoice.invoiceId)),
  );
  const rejected = await readers.rejections.rejectedDaysOf(invoiceIds);
  const lines = noticeLinesOf(input.batches, input.issued, rejected);
  const earlier = await readers.earlier.ofCycle(input.legalEntityId, input.cycleClosesAt);
  const debtors = [
    ...new Set([
      ...lines.map((line) => line.debtorCompanyId),
      ...earlier.map((entry) => entry.notice.toPersistence().debtorCompanyId),
    ]),
  ];
  const contacts = await readers.contacts.contactsOf(debtors);
  const collectionDay = input.batches[0]?.toPersistence().requestedCollectionDay ?? null;
  if (collectionDay === null) {
    // Aucun lot (tout écarté, ou plus rien à prélever) : rien à annoncer, mais
    // les promesses d'un lot annulé s'annulent quand même (PA2, § 7 comblé
    // le 2026-10-09) — elles n'attendent plus une préparation qui prélève.
    return planCancellations({ earlier, contacts, at: input.at, nextId: input.nextId });
  }
  return planNotices({
    legalEntityId: input.legalEntityId,
    cycleClosesAt: input.cycleClosesAt,
    collectionDay,
    creditor: { name: input.creditor.name, ics: input.creditor.ics },
    lines,
    earlier,
    contacts,
    at: input.at,
    nextId: input.nextId,
  });
}

/** Chaque ligne de débit, avec la référence de son arrêté ou de ses factures (E4). */
function noticeLinesOf(
  batches: readonly CollectionBatch[],
  issued: readonly IssuedStatement[],
  rejected: ReadonlyMap<string, string>,
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
          ref: {
            batchId: batch.id,
            lineRank: line.rank,
            statementId,
            invoiceNumbers,
            representedRejectionDay: latestRejection(line.invoices, rejected),
          },
          debtorCompanyId: line.debtorCompanyId,
          debtorName: line.debtorName,
          amountCents: line.amountCents,
          mandateReference: line.mandateReference,
        },
      ];
    }),
  );
}

/** Le rejet le plus récent qu'une de ces factures a connu, `null` si aucune. */
function latestRejection(
  invoices: readonly { readonly invoiceId: string }[],
  rejected: ReadonlyMap<string, string>,
): string | null {
  const days = invoices.flatMap((invoice) => {
    const day = rejected.get(invoice.invoiceId);
    return day === undefined ? [] : [day];
  });
  return days.length === 0 ? null : days.reduce((a, b) => (a > b ? a : b));
}
