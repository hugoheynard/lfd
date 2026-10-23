import { Injectable } from "@nestjs/common";

import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { BillingModeDatesReader } from "../domain/ports/billing-mode-dates.reader.js";
import { BillingStatementRepository } from "../domain/ports/billing-statement.repository.js";
import { CollectionBatchRepository } from "../domain/ports/collection-batch.repository.js";
import { CollectionCalendarReader } from "../domain/ports/collection-calendar.reader.js";
import { CollectionCandidatesReader } from "../domain/ports/collection-candidates.reader.js";
import { CollectionMandatesReader } from "../domain/ports/collection-mandates.reader.js";
import { CollectionNoticeRepository } from "../domain/ports/collection-notice.repository.js";
import { CountedLotInputsReader } from "../domain/ports/counted-lot-inputs.reader.js";
import { CycleNoticesReader } from "../domain/ports/cycle-notices.reader.js";
import { OrderCollectionRepository } from "../domain/ports/order-collection.repository.js";
import { PayerBillingModesReader } from "../domain/ports/payer-billing-modes.reader.js";
import { PayerNoticeContactsReader } from "../domain/ports/payer-notice-contacts.reader.js";
import { RepresentedRejectionsReader } from "../domain/ports/represented-rejections.reader.js";
import { StatementBuyerReader } from "../domain/ports/statement-buyer.reader.js";
import type { InvoicingCalendarReaders } from "./invoicing-calendar-support.js";

/**
 * Les ports de la constitution d'un lot, regroupés PAR ÉTAPE (revue qualité
 * du 2026-10-23) : le handler en recevait vingt à plat. Chaque groupe ne
 * porte que des ports — aucune logique —, et chaque port reste injecté par
 * son propre jeton : on ne cache pas un port derrière un autre.
 */

/**
 * Lire le monde : les candidats, le cycle, les sites et mandats consommés,
 * les mandats actifs, le calendrier de la facture. Partagé par la
 * constitution et l'aperçu, qui lisent exactement la même chose.
 */
@Injectable()
export class CollectionAssemblyReaders {
  /** Le calendrier de la facture (M3) : les dates des modes, les modes des payeurs. */
  readonly calendar: InvoicingCalendarReaders;

  constructor(
    readonly candidates: CollectionCandidatesReader,
    readonly cycle: CollectionCalendarReader,
    readonly sites: CountedLotInputsReader,
    readonly mandates: CollectionMandatesReader,
    modeDates: BillingModeDatesReader,
    payerModes: PayerBillingModesReader,
  ) {
    this.calendar = { modeDates, payerModes };
  }
}

/**
 * Lire ce que les avis et les arrêtés citent : les avis déjà écrits pour le
 * cycle, les adresses des payeurs, les rejets re-présentés, les acheteurs.
 */
@Injectable()
export class ConstitutionNoticeReaders {
  constructor(
    readonly earlier: CycleNoticesReader,
    readonly contacts: PayerNoticeContactsReader,
    readonly rejections: RepresentedRejectionsReader,
    readonly buyers: StatementBuyerReader,
  ) {}
}

/** Écrire : les lots, les arrêtés, les états d'encaissement, les avis et leur envoi. */
@Injectable()
export class ConstitutionWriters {
  constructor(
    readonly batches: CollectionBatchRepository,
    readonly statements: BillingStatementRepository,
    readonly orders: OrderCollectionRepository,
    readonly notices: CollectionNoticeRepository,
    readonly durable: DurablePublisher,
  ) {}
}
