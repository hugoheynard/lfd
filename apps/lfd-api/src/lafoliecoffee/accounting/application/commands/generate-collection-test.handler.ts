import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  CollectionTestFile,
  type TestFileLineInput,
} from "../../domain/entities/collection-test-file.js";
import { CollectionTestCreditorNotFoundError } from "../../domain/errors/collection-test-errors.js";
import { CollectionTestFileEmptyError } from "../../domain/errors/collection-test-file-errors.js";
import { CollectionTestGeneratedEvent } from "../../domain/events/collection-test.events.js";
import { BatchedMandatesReader } from "../../domain/ports/batched-mandates.reader.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { CollectionTestFileRepository } from "../../domain/ports/collection-test-file.repository.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import { EstablishmentCompaniesReader } from "../../domain/ports/establishment-companies.reader.js";
import { MandateCollectionTestsReader } from "../../domain/ports/mandate-collection-tests.reader.js";
import { lookalikeWindowStart } from "../../domain/services/collection-test-lookalike.js";
import { testDebtorVerdictOf } from "../collection-test-support.js";
import { CREATED_ID_REPLAY } from "../created-id-replay.js";
import { establishmentCompanyOrFail } from "../own-establishment-support.js";
import {
  GenerateCollectionTestCommand,
  type CollectionTestDebtorRequest,
} from "./generate-collection-test.command.js";

/**
 * **Génère un envoi d'essai** : juge chaque débiteur (déclaré à nous, actif,
 * un mandat signé), fait générer et contrôler le fichier et ses lignes par
 * l'agrégat `CollectionTestFile`, garde le tout et dit chaque ligne au journal.
 *
 * 🔴 N'écrit QUE `collection_test_file`, `collection_test` et le journal : ni
 * facture, ni bon, ni lot, ni état d'encaissement — aucun de leurs ports
 * n'est injecté ici. Un refus sur une seule ligne n'écrit rien.
 *
 * **Une fois par intention** : sujet, l'envoi entier, débiteurs triés par
 * société — l'ordre des cases cochées ne change pas l'intention. L'agrégat
 * refuse un essai semblable récent, mais sans verrou : deux envois simultanés
 * passeraient tous deux. La même clé rend l'envoi d'origine, scellé avec lui.
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
    private readonly files: CollectionTestFileRepository,
    private readonly history: MandateCollectionTestsReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: GenerateCollectionTestCommand): Promise<string> {
    const debtors = [...command.debtors].sort((a, b) => a.companyId.localeCompare(b.companyId));
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GENERATE_TEST_GESTURE,
        subject: intentSubject(
          GENERATE_TEST_TARGET,
          debtors.map((debtor) => [debtor.companyId, debtor.amountCents, debtor.sequence]),
          command.requestedCollectionDay,
          command.remittance,
        ),
      },
      CREATED_ID_REPLAY,
      (seal) => this.generate(command, seal),
    );
  }

  private async generate(
    command: GenerateCollectionTestCommand,
    seal: (fileId: string) => Promise<void>,
  ): Promise<string> {
    const at = this.clock.now();
    const fileId = this.ids.next();
    return this.uow.run(async () => {
      const lines: TestFileLineInput[] = [];
      for (const debtor of command.debtors) {
        lines.push(await this.lineOf(debtor, at));
      }
      const [head] = lines;
      if (head === undefined) {
        throw new CollectionTestFileEmptyError();
      }
      const creditor = await this.creditors.snapshot(head.verdict.mandate.creditorId);
      if (creditor === null) {
        throw new CollectionTestCreditorNotFoundError(head.verdict.mandate.reference);
      }
      const file = CollectionTestFile.generate({
        id: fileId,
        created: { at, staffId: command.staffUserId },
        creditor,
        requestedCollectionDay: command.requestedCollectionDay,
        remittance: command.remittance,
        lines,
      });
      await this.files.save(file);
      for (const test of file.tests) {
        await this.events.publishTraced(new CollectionTestGeneratedEvent(test, creditor.name, at));
      }
      await seal(file.id);
      return file.id;
    });
  }

  /** Juge un débiteur et lit ses essais récents : la ligne que l'envoi recevra. */
  private async lineOf(debtor: CollectionTestDebtorRequest, at: Date): Promise<TestFileLineInput> {
    const company = await establishmentCompanyOrFail(this.companies, debtor.companyId);
    const verdict = await testDebtorVerdictOf(
      { mandates: this.mandates, batched: this.batched },
      company,
    );
    if (verdict.kind === "refused") {
      throw verdict.refusal;
    }
    const recentOnMandate = await this.history.generatedSince(
      verdict.mandate.mandateId,
      lookalikeWindowStart(at),
    );
    return {
      testId: this.ids.next(),
      debtorCompanyId: company.companyId,
      debtorName: company.name,
      verdict,
      sequence: debtor.sequence,
      amountCents: debtor.amountCents,
      recentOnMandate,
    };
  }
}

/** Le nom stable du geste, dans le registre des intentions. */
const GENERATE_TEST_GESTURE = "accounting.generate-collection-test";

/** Ce que le geste vise : un envoi neuf, que l'empreinte décrit entier. */
const GENERATE_TEST_TARGET = "collection-test-file";
