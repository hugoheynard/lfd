import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { CreditorSnapshot } from "../../domain/creditor-snapshot.js";
import type { CollectionBatch } from "../../domain/entities/collection-batch.js";
import type { CollectionNotice } from "../../domain/entities/collection-notice.js";
import type { OrderCollection } from "../../domain/entities/order-collection.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { NothingToCollectError } from "../../domain/errors/collection-errors.js";
import { BillingStatementIssuedEvent } from "../../domain/events/billing-statement.events.js";
import { CollectionNoticeQueuedFact } from "../../domain/events/collection-notice-queued.fact.js";
import { CollectionNoticeEvent } from "../../domain/events/collection-notice.events.js";
import {
  CollectionBatchConstitutedEvent,
  type BatchEntity,
} from "../../domain/events/collection.events.js";
import { BillingStatementRepository } from "../../domain/ports/billing-statement.repository.js";
import { CollectionBatchRepository } from "../../domain/ports/collection-batch.repository.js";
import { CollectionCandidatesReader } from "../../domain/ports/collection-candidates.reader.js";
import { CollectionLock } from "../../domain/ports/collection-lock.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { CollectionNoticeRepository } from "../../domain/ports/collection-notice.repository.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import { CycleNoticesReader } from "../../domain/ports/cycle-notices.reader.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import { PayerNoticeContactsReader } from "../../domain/ports/payer-notice-contacts.reader.js";
import { StatementBuyerReader } from "../../domain/ports/statement-buyer.reader.js";
import { buildStatements, type IssuedStatement } from "../billing-statement-support.js";
import { buildBatches, orderStates, readAssembly } from "../collection-constitution-support.js";
import { noticesOf } from "../collection-notice-support.js";
import { ConstituteCollectionBatchesCommand } from "./constitute-collection-batches.command.js";

/**
 * **Constitue les lots** d'une entité pour le dernier cycle clos (plan
 * `plan-lot-de-prelevement-fige.md`, §1-§4).
 *
 * Tout se passe sous `pg_advisory_xact_lock` par entité, dans UNE transaction :
 * deux clics simultanés se suivent, et le second ne trouve plus rien à
 * constituer pour les schémas que le premier a pris (l'index partiel
 * `collection_batch_one_live_per_cycle` le tient aussi en base).
 *
 * Les commandes écartées sont enregistrées même quand aucun lot ne naît :
 * c'est ce qui fait qu'une exclusion se LIT à l'écran, au lieu d'être un
 * silence. Le refus n'arrive que si la constitution n'a strictement rien fait.
 *
 * Chaque ligne de débit reçoit son **arrêté de facturation** dans la même
 * transaction (plan `plan-le-prelevement-suit-la-facture.md`, F3) : la
 * facture que `assembleCollection` a calculée pour la ligne, figée telle
 * quelle — son total EST le montant prélevé, jamais recalculé.
 *
 * Chaque ligne reçoit aussi son **avis de prélèvement** (plan
 * `plan-prelevement-automatique.md`, PA2), écrit avec le lot et mis dans la
 * boîte d'envoi (`DurablePublisher`) dans CETTE transaction : un lot sans ses
 * avis, ou un avis sans son lot, ne peut pas exister. L'envoi part après la
 * validation (`SendCollectionNotice`). Une reconstitution rectifie, reconduit
 * ou annule ce qu'un lot annulé avait annoncé.
 *
 * ⚠️ L'entité est lue par `CreditorReader` AVANT la transaction : une entité qui
 * ne peut pas encaisser refuse (409) sans rien verrouiller.
 */
@CommandHandler(ConstituteCollectionBatchesCommand)
export class ConstituteCollectionBatchesHandler implements ICommandHandler<
  ConstituteCollectionBatchesCommand,
  readonly string[]
> {
  constructor(
    private readonly creditors: CreditorReader,
    private readonly candidates: CollectionCandidatesReader,
    private readonly mandates: CollectionMandatesReader,
    private readonly batches: CollectionBatchRepository,
    private readonly orders: OrderCollectionRepository,
    private readonly statements: BillingStatementRepository,
    private readonly buyers: StatementBuyerReader,
    private readonly notices: CollectionNoticeRepository,
    private readonly earlierNotices: CycleNoticesReader,
    private readonly contacts: PayerNoticeContactsReader,
    private readonly durable: DurablePublisher,
    private readonly lock: CollectionLock,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ConstituteCollectionBatchesCommand): Promise<readonly string[]> {
    const { legalEntityId } = command;
    const creditor = await this.creditors.snapshot(legalEntityId);
    if (creditor === null) {
      throw new LegalEntityNotFoundError(legalEntityId);
    }
    return this.uow.run(async () => {
      await this.lock.acquire(legalEntityId);
      const at = this.clock.now();
      const read = await readAssembly(
        { candidates: this.candidates, mandates: this.mandates },
        legalEntityId,
        at,
      );
      const batches = buildBatches({
        read,
        legalEntityId,
        creditor,
        at,
        author: command.author,
        nextId: () => this.ids.next(),
      });
      const states = orderStates(read, batches, at);
      if (states.length === 0) {
        throw new NothingToCollectError(0);
      }
      const issued = buildStatements({
        batches,
        debits: read.assembly.debits,
        creditor,
        buyers: await this.buyers.buyersOf(payersOf(batches)),
        at,
        nextId: () => this.ids.next(),
      });
      const notices = await this.noticesFor(creditor, read.cycle.closesAt, batches, issued, at);
      await this.persist(batches, issued, states);
      await this.notices.insertAll(notices);
      const entity = { id: legalEntityId, name: creditor.name };
      await this.publish(batches, issued, entity, at, read.assembly.exclusions.length);
      await this.queue(notices, entity, at);
      return batches.map((batch) => batch.id);
    });
  }

  /** Les lots d'abord : un arrêté cite sa ligne (clé étrangère). */
  private async persist(
    batches: readonly CollectionBatch[],
    issued: readonly IssuedStatement[],
    states: readonly OrderCollection[],
  ): Promise<void> {
    for (const batch of batches) {
      await this.batches.save(batch);
    }
    for (const { statement } of issued) {
      await this.statements.insert(statement);
    }
    await this.orders.saveAll(states);
  }

  /** Les avis de cette constitution, décidés par le domaine (PA2). */
  private noticesFor(
    creditor: CreditorSnapshot,
    cycleClosesAt: Date,
    batches: readonly CollectionBatch[],
    issued: readonly IssuedStatement[],
    at: Date,
  ): Promise<readonly CollectionNotice[]> {
    return noticesOf(
      { earlier: this.earlierNotices, contacts: this.contacts },
      {
        legalEntityId: creditor.legalEntityId,
        creditor,
        cycleClosesAt,
        batches,
        issued,
        at,
        nextId: () => this.ids.next(),
      },
    );
  }

  /**
   * Chaque avis à envoyer part dans la boîte d'envoi. Le journal retient les
   * avis en file et les non envoyables ; pas la reconduction, qui n'annonce
   * rien de neuf — l'avis parti qu'elle suit y est déjà.
   */
  private async queue(
    notices: readonly CollectionNotice[],
    entity: BatchEntity,
    at: Date,
  ): Promise<void> {
    for (const notice of notices) {
      if (notice.needsSending) {
        await this.durable.publish(new CollectionNoticeQueuedFact(notice.id).durableFact());
      }
      if (notice.kind !== "unchanged") {
        await this.events.publishTraced(new CollectionNoticeEvent(notice, entity, at));
      }
    }
  }

  private async publish(
    batches: readonly CollectionBatch[],
    issued: readonly IssuedStatement[],
    entity: BatchEntity,
    at: Date,
    excludedCount: number,
  ): Promise<void> {
    for (const batch of batches) {
      await this.events.publishTraced(
        new CollectionBatchConstitutedEvent(batch, entity, at, excludedCount),
      );
    }
    for (const { statement, batch, debtorName } of issued) {
      const payer = { id: statement.toPersistence().payerCompanyId, name: debtorName };
      await this.events.publishTraced(
        new BillingStatementIssuedEvent(statement, batch, entity, payer, at),
      );
    }
  }
}

/** Les sociétés débitées par les lignes de ces lots. */
function payersOf(batches: readonly CollectionBatch[]): readonly string[] {
  return [...new Set(batches.flatMap((batch) => batch.lines.map((line) => line.debtorCompanyId)))];
}
