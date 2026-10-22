import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  FixedStaffAuthorDirectory,
  authorsKnownAs,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import type { CreditorSnapshot } from "../../../domain/creditor-snapshot.js";
import {
  CREATED_AT,
  OUR_COMPANY,
} from "../../../domain/entities/__tests__/collection-test-fixtures.js";
import { CREDITOR, mandate } from "../../../domain/services/__tests__/collection-fixtures.js";
import { GetCollectionTestDebtorsHandler } from "../../queries/get-collection-test-debtors.handler.js";
import { ListCollectionTestsHandler } from "../../queries/list-collection-tests.handler.js";
import { ListOwnEstablishmentsHandler } from "../../queries/list-own-establishments.handler.js";
import type { CollectionTest } from "../../../domain/entities/collection-test.js";
import {
  CollectionTestsReader,
  type CollectionTestSummary,
} from "../../../domain/ports/collection-tests.reader.js";
import { DeclareOwnEstablishmentHandler } from "../declare-own-establishment.handler.js";
import { GenerateCollectionTestHandler } from "../generate-collection-test.handler.js";
import { MarkCollectionTestRefundedHandler } from "../mark-collection-test-refunded.handler.js";
import { WithdrawOwnEstablishmentHandler } from "../withdraw-own-establishment.handler.js";
import { FakeMandates, FixedCreditors, UlidSequence } from "./collection-doubles.js";
import {
  FakeBatchedMandates,
  FakeEstablishmentCompanies,
  MemoryCollectionTests,
  MemoryOwnEstablishments,
  MemoryOwnEstablishmentsReader,
} from "./collection-test-doubles.js";

/** La liste « Essais », lue dans la mémoire. */
class MemoryTestsReader extends CollectionTestsReader {
  constructor(private readonly tests: MemoryCollectionTests) {
    super();
  }
  list(): Promise<readonly CollectionTestSummary[]> {
    return Promise.resolve([...this.tests.saved.values()].map(summaryOf));
  }
}

function summaryOf(test: CollectionTest): CollectionTestSummary {
  const { xml: _xml, fileSha256: _sha256, ...summary } = test.toPersistence();
  return summary;
}

/**
 * Le monde du prélèvement d'essai : une société à nous (pas encore
 * déclarée), active, avec un mandat récurrent chez l'entité `le_1`.
 */
export function collectionTestWorld(creditor: CreditorSnapshot | null = CREDITOR) {
  const establishments = new MemoryOwnEstablishments();
  const companies = new FakeEstablishmentCompanies(establishments);
  companies.companies.set(OUR_COMPANY, { name: "Folie Douce Val", status: "active" });
  const mandates = new FakeMandates();
  mandates.mandates = [mandate(OUR_COMPANY)];
  const batched = new FakeBatchedMandates();
  const creditors = new FixedCreditors(creditor);
  const tests = new MemoryCollectionTests();
  const events = new RecordingPublisher();
  const clock = new FixedClock(CREATED_AT);
  const uow = new DirectUnitOfWork();
  const authors = new FixedStaffAuthorDirectory(
    authorsKnownAs({ firstName: "Camille", lastName: "Compta" }, "staff_1"),
  );
  const list = new MemoryOwnEstablishmentsReader(establishments, companies);
  return {
    establishments,
    companies,
    mandates,
    batched,
    tests,
    events,
    clock,
    declare: new DeclareOwnEstablishmentHandler(companies, establishments, clock, events, uow),
    withdraw: new WithdrawOwnEstablishmentHandler(companies, establishments, clock, events, uow),
    generate: new GenerateCollectionTestHandler(
      companies,
      mandates,
      batched,
      creditors,
      tests,
      new UlidSequence(),
      clock,
      events,
      uow,
    ),
    refund: (at: Date) =>
      new MarkCollectionTestRefundedHandler(tests, new FixedClock(at), events, uow),
    listEstablishments: new ListOwnEstablishmentsHandler(list, authors),
    debtors: new GetCollectionTestDebtorsHandler(list, mandates, batched, creditors, clock),
    listTests: (at: Date) =>
      new ListCollectionTestsHandler(new MemoryTestsReader(tests), authors, new FixedClock(at)),
  };
}
