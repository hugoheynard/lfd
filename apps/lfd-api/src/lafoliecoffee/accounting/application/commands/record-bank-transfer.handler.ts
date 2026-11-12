import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { IntentRecord } from "../../../../platform/intent/gesture-intent.js";
import {
  type IntentCodec,
  OncePerIntent,
  readIntentString,
} from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { StaffStamp } from "../../domain/entities/collection-batch.js";
import type { OrderCollection } from "../../domain/entities/order-collection.js";
import { ReceivedBankTransfer } from "../../domain/entities/received-bank-transfer.js";
import { BankTransferOrderOutOfScopeError } from "../../domain/errors/bank-transfer-errors.js";
import { BankTransferReceivedEvent } from "../../domain/events/bank-transfer.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import { OrderInvoicingLock } from "../../domain/ports/order-invoicing-lock.js";
import { ReceivedBankTransferRepository } from "../../domain/ports/received-bank-transfer.repository.js";
import { TransferInvoicesReader } from "../../domain/ports/transfer-invoices.reader.js";
import { parisDayOf } from "../../domain/services/collection-test-file.js";
import { loadOrFail } from "../legal-entity-support.js";
import { RecordBankTransferCommand } from "./record-bank-transfer.command.js";

/** Le nom stable du geste, pour la clé d'intention. */
export const RECORD_BANK_TRANSFER_GESTURE = "accounting.record-bank-transfer";

/** Le résultat gardé : l'identifiant du virement saisi. */
export const TRANSFER_ID_REPLAY: IntentCodec<string> = {
  write: (transferId): IntentRecord => ({ transferId }),
  read: (record, gesture) => readIntentString(record, "transferId", gesture),
};

/**
 * **« Virement reçu »** (V7). L'agrégat `ReceivedBankTransfer` juge la saisie
 * (montant = reste dû des factures, factures au virement, non réglées, d'un
 * seul payeur) ; chaque bon de ces factures passe `settled_by_transfer` par
 * `OrderCollection` — jamais une écriture nue sur la facture, sans quoi un
 * retour au prélèvement prélèverait des bons encore `due`.
 *
 * Une transaction : les bons verrouillés dans l'ordre de leurs identifiants
 * (le verrou de la facturation, que le lot et l'annulation prennent aussi),
 * puis la lecture des factures, le virement, les bons, le fait, le sceau.
 *
 * ## Une fois par intention
 *
 * Sujet : l'entité. Un second envoi de même clé rend le virement d'origine
 * sans rien réécrire. Avec une autre clé, les factures sont déjà réglées : refus
 * qui nomme la première.
 *
 * @throws {LegalEntityNotFoundError} entité inconnue.
 * @throws les refus de `ReceivedBankTransfer.record` et de `OrderCollection.settleByTransfer`.
 * @throws {BankTransferOrderOutOfScopeError} un bon hors de l'assiette d'encaissement.
 */
@CommandHandler(RecordBankTransferCommand)
export class RecordBankTransferHandler implements ICommandHandler<
  RecordBankTransferCommand,
  string
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly invoices: TransferInvoicesReader,
    private readonly transfers: ReceivedBankTransferRepository,
    private readonly orders: OrderCollectionRepository,
    private readonly rows: OrderInvoicingLock,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: RecordBankTransferCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: RECORD_BANK_TRANSFER_GESTURE,
        subject: command.legalEntityId,
      },
      TRANSFER_ID_REPLAY,
      (seal) => this.record(command, seal),
    );
  }

  private async record(
    command: RecordBankTransferCommand,
    seal: (transferId: string) => Promise<void>,
  ): Promise<string> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const at = this.clock.now();
    const stamp: StaffStamp = { at, staffId: command.staffUserId };
    return this.uow.run(async () => {
      await this.lockOrdersOf(command.entry.invoiceIds);
      const transfer = ReceivedBankTransfer.record(
        command.entry,
        await this.invoices.ofIds(command.entry.invoiceIds),
        {
          transferId: this.ids.next(),
          legalEntityId: entity.id,
          staffId: command.staffUserId,
          at,
          today: parisDayOf(at),
        },
      );
      const settled = await this.settleOrders(transfer, stamp);
      await this.transfers.add(transfer);
      await this.orders.saveAll(settled);
      await this.events.publishTraced(
        new BankTransferReceivedEvent(transfer, { id: entity.id, name: entity.name }),
      );
      await seal(transfer.id);
      return transfer.id;
    });
  }

  /** Les bons des factures citées, verrouillés dans un ordre stable. */
  private async lockOrdersOf(invoiceIds: readonly string[]): Promise<void> {
    const invoices = await this.invoices.ofIds(invoiceIds);
    const orderIds = [...new Set(invoices.flatMap((invoice) => invoice.orderIds))].sort();
    for (const orderId of orderIds) {
      await this.rows.lock(orderId);
    }
  }

  /** Chaque bon de chaque facture, réglé par le virement — refus de l'agrégat s'il est engagé. */
  private async settleOrders(
    transfer: ReceivedBankTransfer,
    stamp: StaffStamp,
  ): Promise<readonly OrderCollection[]> {
    const settled: OrderCollection[] = [];
    for (const invoice of transfer.toState().invoices) {
      for (const orderId of invoice.orderIds) {
        const collection = await this.orders.load(orderId);
        if (collection === null) {
          throw new BankTransferOrderOutOfScopeError(invoice.number, orderId);
        }
        collection.settleByTransfer(transfer.id, stamp);
        settled.push(collection);
      }
    }
    return settled;
  }
}
