import { instantToLocal, localToInstant } from "@lfd/contracts";

import type { PeriodQuoteSnapshot } from "../../domain/entities/period-quote.js";
import { periodTagOf } from "../../domain/services/invoicing-closures.js";
import type { InvoiceableOrder } from "../../domain/services/monthly-invoicing.js";
import { periodQuoteFigures } from "../../domain/services/period-quote-fingerprint.js";
import type { PeriodQuoteSeller } from "../../domain/services/period-quote-pdf.js";
import { specimenFrozenOrders } from "./specimen-data.js";

/**
 * **Le devis de période d'exemple** — la planche des documents de la
 * Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * 🔴 Jamais persisté : les deux bons d'exemple de la facture, chiffrés par
 * le même calcul (`periodQuoteFigures`, `simulateInvoiceDossier`) ; aucun
 * compteur ne donne son numéro, aucun stockage ne le range, aucun e-mail ne
 * part. Vendeur et payeur sont fictifs et le disent.
 */

/** Le rang imprimé : qu'aucun devis réel n'atteindra dans une période. */
const SPECIMEN_RANK = 999;
/** Le payeur d'exemple, un organisme public. */
const PAYER = "EXEMPLE — Caserne des Alpes";

/** Le vendeur d'exemple, celui de la facture d'exemple. */
export const SPECIMEN_QUOTE_SELLER: PeriodQuoteSeller = {
  name: "EXEMPLE — La Folie Coffee",
  legalForm: "SAS",
  siren: "999999999",
  vatNumber: "FR00999999999",
  addressLines: ["EXEMPLE — route de la Balme", "73150 Val d'Isère"],
};

/** La mercuriale citée par le devis d'exemple. */
export const SPECIMEN_QUOTE_MERCURIALE = "EXEMPLE — Tarif convenu de la caserne";

/** Les deux bons d'exemple, en commandes à facturer. */
export function specimenQuoteOrders(now: Date): readonly InvoiceableOrder[] {
  return specimenFrozenOrders(now).map((order) => ({
    orderId: order.orderId,
    orderNumber: order.reference,
    companyId: "specimen-company",
    placedAt: now,
    receivedOn: order.receivedOn,
    billedCompanyId: null,
    frozen: order.frozen,
    deliveryNoteNumbers: [],
    budgetCommitment: null,
  }));
}

/**
 * **Le devis d'exemple** : les sept jours qui finissent la veille de `now`
 * (la clôture est minuit, heure de Paris, du jour de `now`), en version 2
 * pour montrer la version imprimée.
 */
export function specimenPeriodQuote(
  now: Date,
  orders: readonly InvoiceableOrder[],
): PeriodQuoteSnapshot {
  const today = instantToLocal(now).day;
  const closesAt = localToInstant(today, "00:00") ?? now;
  const startsAt = new Date(closesAt.getTime() - SPECIMEN_PERIOD_DAYS * DAY_MS);
  return {
    id: "specimen-period-quote",
    number: `D-${periodTagOf(closesAt)}-${String(SPECIMEN_RANK)}`,
    version: 2,
    legalEntityId: "specimen-legal-entity",
    payerCompanyId: "specimen-company",
    payerName: PAYER,
    mandateId: null,
    serviceCode: "EXEMPLE-SERV",
    periodStartsAt: startsAt,
    periodClosesAt: closesAt,
    state: "awaiting",
    invoiceId: null,
    ...periodQuoteFigures(orders),
    orderIds: orders.map((order) => order.orderId),
    createdAt: now,
  };
}

const SPECIMEN_PERIOD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
