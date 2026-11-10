import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { CollectionTest, TestBankReturn } from "../entities/collection-test.js";
import { reasonDescription } from "../value-objects/bank-return-reason.js";
import { COLLECTION_TEST_FACT_TYPES } from "./accounting-facts.js";
import type { ExportEntity } from "./mandate-bank-export.events.js";

/** La société, avec son nom du moment — le sujet de chacun de ces faits. */
export interface TestSubject {
  readonly companyId: string;
  readonly name: string;
}

function companyFact(
  type: JournalFact["type"],
  subject: TestSubject,
  at: Date,
  payload: Readonly<Record<string, unknown>>,
): JournalFact {
  return {
    type,
    subjectType: "company",
    subjectId: subject.companyId,
    occurredAt: at,
    payload: { subjectLabel: subject.name, ...payload },
  };
}

/** La société est déclarée parmi nos établissements. */
export class OwnEstablishmentDeclaredEvent implements JournaledEvent {
  constructor(
    readonly subject: TestSubject,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return companyFact(COLLECTION_TEST_FACT_TYPES.establishmentDeclared, this.subject, this.at, {});
  }
}

/** Elle n'en est plus. */
export class OwnEstablishmentWithdrawnEvent implements JournaledEvent {
  constructor(
    readonly subject: TestSubject,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return companyFact(
      COLLECTION_TEST_FACT_TYPES.establishmentWithdrawn,
      this.subject,
      this.at,
      {},
    );
  }
}

function testPayload(test: CollectionTest): Readonly<Record<string, unknown>> {
  const state = test.toPersistence();
  return { messageId: state.messageId, amountCents: state.amountCents };
}

function subjectOf(test: CollectionTest): TestSubject {
  const state = test.toPersistence();
  return { companyId: state.debtorCompanyId, name: state.debtorName };
}

/** Un fichier d'essai est généré. L'entité émettrice est nommée par l'appelant. */
export class CollectionTestGeneratedEvent implements JournaledEvent {
  constructor(
    readonly test: CollectionTest,
    readonly legalEntityName: string,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    const state = this.test.toPersistence();
    return companyFact(COLLECTION_TEST_FACT_TYPES.generated, subjectOf(this.test), this.at, {
      ...testPayload(this.test),
      legalEntity: { id: state.legalEntityId, name: this.legalEntityName },
      scheme: state.scheme,
      sequence: state.sequence,
      collectionDay: state.requestedCollectionDay,
    });
  }
}

/** « Marqué remboursé ». */
export class CollectionTestRefundedEvent implements JournaledEvent {
  constructor(
    readonly test: CollectionTest,
    readonly refundedOn: string,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return companyFact(COLLECTION_TEST_FACT_TYPES.refunded, subjectOf(this.test), this.at, {
      ...testPayload(this.test),
      refundedOn: this.refundedOn,
    });
  }
}

/** Le retour de la banque est rattaché à l'essai. */
export class CollectionTestReturnedEvent implements JournaledEvent {
  constructor(
    readonly test: CollectionTest,
    readonly bankReturn: TestBankReturn,
  ) {}

  journalFact(): JournalFact {
    const { bankReturn } = this;
    return companyFact(
      COLLECTION_TEST_FACT_TYPES.returned,
      subjectOf(this.test),
      bankReturn.recorded.at,
      {
        ...testPayload(this.test),
        kind: bankReturn.kind,
        reasonCode: bankReturn.reasonCode,
        reason: reasonDescription(bankReturn.reasonCode, bankReturn.reasonLabel),
        returnedOn: bankReturn.returnedOn,
        source: bankReturn.source,
      },
    );
  }
}

/** Le RIB d'un établissement est sorti pour la banque, depuis l'essai. */
export class CollectionTestBankAccountExportedEvent implements JournaledEvent {
  constructor(
    readonly subject: TestSubject,
    readonly legalEntity: ExportEntity,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return companyFact(COLLECTION_TEST_FACT_TYPES.bankAccountExported, this.subject, this.at, {
      legalEntity: { id: this.legalEntity.id, name: this.legalEntity.name },
    });
  }
}
