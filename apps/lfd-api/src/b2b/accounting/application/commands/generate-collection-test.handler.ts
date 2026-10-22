import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionTest } from "../../domain/entities/collection-test.js";
import { CollectionTestCreditorNotFoundError } from "../../domain/errors/collection-test-errors.js";
import { CollectionTestGeneratedEvent } from "../../domain/events/collection-test.events.js";
import { BatchedMandatesReader } from "../../domain/ports/batched-mandates.reader.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { CollectionTestRepository } from "../../domain/ports/collection-test.repository.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import { EstablishmentCompaniesReader } from "../../domain/ports/establishment-companies.reader.js";
import { testDebtorVerdictOf } from "../collection-test-support.js";
import { establishmentCompanyOrFail } from "../own-establishment-support.js";
import { GenerateCollectionTestCommand } from "./generate-collection-test.command.js";

/**
 * **Génère un prélèvement d'essai** : juge le débiteur (déclaré à nous, actif,
 * un mandat signé), fait générer et contrôler le fichier par l'agrégat, le
 * garde et le dit au journal.
 *
 * 🔴 N'écrit QUE `collection_test` et le journal : ni facture, ni bon, ni lot,
 * ni état d'encaissement — aucun de leurs ports n'est injecté ici.
 */
@CommandHandler(GenerateCollectionTestCommand)
export class GenerateCollectionTestHandler implements ICommandHandler<
  GenerateCollectionTestCommand,
  string
> {
  constructor(
    private readonly companies: EstablishmentCompaniesReader,
    private readonly mandates: CollectionMandatesReader,
    private readonly batched: BatchedMandatesReader,
    private readonly creditors: CreditorReader,
    private readonly tests: CollectionTestRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: GenerateCollectionTestCommand): Promise<string> {
    const at = this.clock.now();
    const company = await establishmentCompanyOrFail(this.companies, command.companyId);
    return this.uow.run(async () => {
      const verdict = await testDebtorVerdictOf(
        { mandates: this.mandates, batched: this.batched },
        company,
      );
      if (verdict.kind === "refused") {
        throw verdict.refusal;
      }
      const creditor = await this.creditors.snapshot(verdict.mandate.creditorId);
      if (creditor === null) {
        throw new CollectionTestCreditorNotFoundError(verdict.mandate.reference);
      }
      const test = CollectionTest.generate({
        id: this.ids.next(),
        created: { at, staffId: command.staffUserId },
        creditor,
        debtorCompanyId: company.companyId,
        debtorName: company.name,
        verdict,
        sequence: command.sequence,
        amountCents: command.amountCents,
        requestedCollectionDay: command.requestedCollectionDay,
        remittance: command.remittance,
      });
      await this.tests.save(test);
      await this.events.publishTraced(new CollectionTestGeneratedEvent(test, creditor.name, at));
      return test.id;
    });
  }
}
