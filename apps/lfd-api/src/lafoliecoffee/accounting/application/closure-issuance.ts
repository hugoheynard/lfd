import { instantToLocal } from "@lfd/contracts";

import type { CreditorSnapshot } from "../domain/creditor-snapshot.js";
import { LegalEntityNotFoundError } from "../domain/errors/accounting-errors.js";
import { NotTheInvoicingEntityError } from "../domain/errors/monthly-invoice-errors.js";
import type { CreditorReader } from "../domain/ports/creditor.reader.js";
import type { InvoiceIssuersReader } from "../domain/ports/invoice-issuers.reader.js";
import type { BillingFollow } from "../domain/ports/statement-billing.reader.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import {
  invoiceDueDay,
  transferDueDay,
  type NextClosure,
} from "../domain/services/invoice-due-day.js";
import type { InvoiceSellerFacts } from "../domain/services/invoice-issuance-blockers.js";
import { lastDayOf } from "../domain/services/invoicing-closures.js";
import type { PayerOrders } from "../domain/services/monthly-invoicing.js";
import { later, type Issuance } from "./monthly-invoice-issuance.js";
import { readMonthlyContext, type MonthlyContextReaders } from "./monthly-invoice-support.js";

/**
 * **L'`Issuance` d'une clôture** — ce qu'une facture de période fige avant
 * d'être numérotée : le vendeur, le créancier, le contexte des payeurs, le
 * jour d'émission et les échéances. Une seule construction pour les deux
 * chemins qui émettent une facture de période : la clôture
 * (`IssueMonthlyInvoicesHandler`) et « Engagement reçu » sur un devis de
 * période (plan `plan-clients-publics-chorus.md`, § 6 sexies, v5 S2).
 */

/** Ce que l'émission lit de l'entité qui facture. */
export interface IssuingPartiesReaders {
  readonly creditors: CreditorReader;
  readonly issuers: InvoiceIssuersReader;
}

/** L'entité qui facture : son créancier et ses faits de vendeur. */
export interface IssuingParties {
  readonly creditor: CreditorSnapshot;
  readonly sellerFacts: InvoiceSellerFacts;
}

/**
 * La clôture vue par l'émission. Un devis la fige sur lui-même : sa période
 * et le début de période du payeur sont ceux du devis, jamais ceux du
 * calendrier du jour.
 */
export interface ClosureFrame {
  readonly legalEntityId: string;
  /** La période affichée de la clôture. */
  readonly period: BillingCycle;
  readonly periodLabel: string;
  /** Le lot qui prendra une facture émise après sa clôture (l'échéance du prélèvement). */
  readonly closures: NextClosure;
  /** La période DU PAYEUR close ici : son début choisit le moyen (V3', K10). */
  readonly payerPeriodOf: (payerId: string) => BillingCycle;
  /** L'instant du geste ou du passage. */
  readonly at: Date;
}

/**
 * Le créancier et le vendeur — la seule entité en service, et c'est elle
 * (comme le mandat, `soleIssuer`).
 *
 * @throws {LegalEntityNotFoundError} l'entité n'existe pas.
 * @throws {NotTheInvoicingEntityError} elle n'est pas la seule entité émettrice.
 */
export async function readIssuingParties(
  readers: IssuingPartiesReaders,
  legalEntityId: string,
): Promise<IssuingParties> {
  const creditor = await readers.creditors.snapshot(legalEntityId);
  if (creditor === null) {
    throw new LegalEntityNotFoundError(legalEntityId);
  }
  const active = await readers.issuers.activeIssuers();
  const [sole, ...others] = active;
  if (sole === undefined || others.length > 0 || sole.legalEntityId !== legalEntityId) {
    throw new NotTheInvoicingEntityError(legalEntityId);
  }
  return { creditor, sellerFacts: sole };
}

/**
 * L'`Issuance` de ces payeurs à cette clôture. Jamais d'antidate : émise
 * après la veille de la clôture, la facture porte le jour réel (Paris) — le
 * compteur refuse un jour antérieur à la dernière pièce ; la période facturée
 * reste la même.
 */
export async function closureIssuance(
  readers: MonthlyContextReaders,
  parties: IssuingParties,
  frame: ClosureFrame,
  payers: readonly PayerOrders[],
  follows: readonly BillingFollow[],
): Promise<Issuance> {
  const { legalEntityId, period, at } = frame;
  const context = await readMonthlyContext(readers, payers, follows, at, {
    legalEntityId,
    periodStartOf: (payerId) => frame.payerPeriodOf(payerId).startsAt,
  });
  const { creditor } = parties;
  const { preNotificationDays, collectionDaysAfterClosure } = creditor;
  const issuedOn = later(lastDayOf(period.closesAt), instantToLocal(at).day);
  return {
    legalEntityId,
    period,
    periodLabel: frame.periodLabel,
    payerPeriodOf: frame.payerPeriodOf,
    issuedOn,
    transferDueOn: transferDueDay(issuedOn, creditor.transferDueDaysAfterIssue),
    collectionDueOn: later(
      issuedOn,
      invoiceDueDay(period.closesAt, at, frame.closures, {
        preNotificationDays,
        collectionDaysAfterClosure,
      }),
    ),
    creditor,
    sellerFacts: parties.sellerFacts,
    context,
    at,
  };
}
