import type { BillingModeDatesReader } from "../domain/ports/billing-mode-dates.reader.js";
import type { PayerBillingModesReader } from "../domain/ports/payer-billing-modes.reader.js";
import type { EntityBillingDates } from "../domain/services/entity-billing-dates.js";
import { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";

/** Ce que le calendrier de la facture lit : les dates des modes, les modes des payeurs. */
export interface InvoicingCalendarReaders {
  readonly modeDates: BillingModeDatesReader;
  readonly payerModes: PayerBillingModesReader;
}

/**
 * Les dates de facturation d'une entité — deux lectures, une fois pour tous
 * les payeurs. Sans ligne, les défauts : n'atteste pas que l'entité existe.
 */
export async function readBillingDates(
  readers: InvoicingCalendarReaders,
  legalEntityId: string,
): Promise<EntityBillingDates> {
  const [modes, payers] = await Promise.all([
    readers.modeDates.timelinesOf(legalEntityId),
    readers.payerModes.segmentsOf(legalEntityId),
  ]);
  return { modes, payers };
}

/**
 * Le calendrier de la facture d'une entité (lot M2). N'atteste pas que
 * l'entité existe : chaque appelant le vérifie par le port qu'il lit déjà.
 */
export async function readInvoicingCalendar(
  readers: InvoicingCalendarReaders,
  legalEntityId: string,
): Promise<InvoicingCalendar> {
  const { modes, payers } = await readBillingDates(readers, legalEntityId);
  return InvoicingCalendar.of(modes, payers);
}
