import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionTest } from "../../domain/entities/collection-test.js";
import { CollectionTestCreditorNotFoundError } from "../../domain/errors/collection-test-errors.js";
import { CollectionTestGeneratedEvent } from "../../domain/events/collection-test.events.js";
import { BatchedMandatesReader } from "../../domain/ports/batched-mandates.reader.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { CollectionTestRepository } from "../../domain/ports/collection-test.repository.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import { EstablishmentCompaniesReader } from "../../domain/ports/establishment-companies.reader.js";
import { MandateCollectionTestsReader } from "../../domain/ports/mandate-collection-tests.reader.js";
import { lookalikeWindowStart } from "../../domain/services/collection-test-lookalike.js";
import { testDebtorVerdictOf } from "../collection-test-support.js";
import { CREATED_ID_REPLAY } from "../created-id-replay.js";
import { establishmentCompanyOrFail } from "../own-establishment-support.js";
import { GenerateCollectionTestCommand } from "./generate-collection-test.command.js";

/**
 * **Génère un prélèvement d'essai** : juge le débiteur (déclaré à nous, actif,
 * un mandat signé), fait générer et contrôler le fichier par l'agrégat, le
 * garde et le dit au journal.
 *
 * 🔴 N'écrit QUE `collection_test` et le journal : ni facture, ni bon, ni lot,
 * ni état d'encaissement — aucun de leurs ports n'est injecté ici.
 *
 * **Une fois par intention** : sujet, l'établissement. L'agrégat refuse un
 * essai semblable récent, mais sans verrou : deux envois simultanés passaient
 * tous deux (deux fichiers, deux prélèvements à déposer), et un double clic
 * lisait sinon un refus après un succès. La même clé rend l'essai d'origine,
 * scellé avec lui.
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
    private readonly history: MandateCollectionTestsReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: GenerateCollectionTestCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GENERATE_TEST_GESTURE,
        subject: command.companyId,
      },
      CREATED_ID_REPLAY,
      (seal) => this.generate(command, seal),
    );
  }

  private async generate(
    command: GenerateCollectionTestCommand,
    seal: (testId: string) => Promise<void>,
  ): Promise<string> {
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
      const recentOnMandate = await this.history.generatedSince(
        verdict.mandate.mandateId,
        lookalikeWindowStart(at),
      );
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
        recentOnMandate,
      });
      await this.tests.save(test);
      await this.events.publishTraced(new CollectionTestGeneratedEvent(test, creditor.name, at));
      await seal(test.id);
      return test.id;
    });
  }
}

/** Le nom stable du geste, dans le registre des intentions. */
const GENERATE_TEST_GESTURE = "accounting.generate-collection-test";
