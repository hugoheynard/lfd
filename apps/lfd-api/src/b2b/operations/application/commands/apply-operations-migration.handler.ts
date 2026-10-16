import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ReferentialOperations } from "../../../../pim/channels/b2b-platform/operations/referential-operations.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OperationImageLibrary } from "../../channels/media/operation-image-library.js";
import { Operation, type WriteStamp } from "../../domain/entities/operation.js";
import { OperationsMigrationBlockedError } from "../../domain/errors/operation-errors.js";
import { OperationRestrictionCarriedOverEvent } from "../../domain/events/operation.events.js";
import { MirroredOperationsReader } from "../../domain/ports/mirrored-operations.reader.js";
import { OperationAdoption } from "../../domain/ports/operation-adoption.js";
import { OperationRepository } from "../../domain/ports/operation.repository.js";
import { OperationSkuCatalogue } from "../../domain/ports/operation-sku.catalogue.js";
import { OperationWritingSwitch } from "../../domain/ports/operation-writing-switch.js";
import type { MigrationLine } from "../../domain/services/operation-migration.js";
import { readMigration } from "../migration/migration-sources.js";
import { ApplyOperationsMigrationCommand } from "./apply-operations-migration.command.js";
import { ensureWritingOpen } from "./operation-writing.js";

/**
 * **Écrit au commerce les opérations du référentiel**, restreintes par la
 * surcharge de la réception (lot 3 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`, O4
 * et « La migration repart du PIM »).
 *
 * - **Interrupteur ouvert seulement** : fermé, le push écrit encore les
 *   opérations et écraserait ce qu'elle écrit.
 * - **Tout ou rien** : relit le plan dans la transaction ; une ligne bloquée
 *   et rien n'est écrit.
 * - **Par l'agrégat** : `fromReferential` pour une opération jamais envoyée,
 *   `adoptReferential` pour une copie — qui refuse une opération déjà écrite
 *   au commerce. C'est ce qui la rend **rejouable** : la seconde fois, le plan
 *   n'a plus rien à écrire.
 * - **Un fait par opération restreinte** (`catalog_operation.restriction_carried_over`) :
 *   qui avait restreint quoi.
 *
 * Rien n'est supprimé : les tables du référentiel et la surcharge restent.
 */
@CommandHandler(ApplyOperationsMigrationCommand)
export class ApplyOperationsMigrationHandler implements ICommandHandler<
  ApplyOperationsMigrationCommand,
  void
> {
  constructor(
    private readonly referential: ReferentialOperations,
    private readonly mirror: MirroredOperationsReader,
    private readonly skus: OperationSkuCatalogue,
    private readonly library: OperationImageLibrary,
    private readonly operations: OperationRepository,
    private readonly adoption: OperationAdoption,
    private readonly writing: OperationWritingSwitch,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {OperationWritingClosedError} interrupteur fermé.
   * @throws {OperationsMigrationBlockedError} une ligne au moins est bloquée.
   */
  async execute(command: ApplyOperationsMigrationCommand): Promise<void> {
    ensureWritingOpen(this.writing);
    const stamp: WriteStamp = { by: command.appliedBy, at: this.clock.now() };
    await this.uow.run(async () => {
      const { lines } = await readMigration(
        {
          referential: this.referential,
          mirror: this.mirror,
          skus: this.skus,
          library: this.library,
        },
        stamp.at,
      );
      const blocked = lines.filter((line) => line.outcome === "blocked");
      if (blocked.length > 0) {
        throw new OperationsMigrationBlockedError(blocked.map((line) => line.key));
      }
      for (const line of lines) {
        await this.write(line, stamp);
      }
    });
  }

  private async write(line: MigrationLine, stamp: WriteStamp): Promise<void> {
    if (line.values === null) {
      return;
    }
    const existing = await this.operations.load(line.key);
    const operation = existing === null ? Operation.fromReferential(line.values, stamp) : existing;
    if (existing !== null) {
      existing.adoptReferential(line.values, stamp);
    }
    await this.adoption.adopt(operation);
    if (line.restriction !== null) {
      await this.events.publishTraced(
        new OperationRestrictionCarriedOverEvent(
          { key: line.key, name: operation.snapshot().name.fr },
          line.restriction,
        ),
      );
    }
  }
}
