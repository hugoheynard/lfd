import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CollectionTestBankAccountNotExportableError } from "../../../domain/errors/collection-test-bank-account-errors.js";
import { NotOwnEstablishmentError } from "../../../domain/errors/collection-test-errors.js";
import { OUR_COMPANY } from "../../../domain/entities/__tests__/collection-test-fixtures.js";
import { mandate } from "../../../domain/services/__tests__/collection-fixtures.js";
import {
  IBAN_A,
  IBAN_B,
  debitedAccount,
} from "../../../domain/services/__tests__/account-for-bank-export.fixture.js";
import { accountBankCsvOf } from "../../account-bank-export-support.js";
import { RecordCollectionTestBankAccountDownloadCommand } from "../../commands/record-collection-test-bank-account-download.command.js";
import { RecordCollectionTestBankAccountDownloadHandler } from "../../commands/record-collection-test-bank-account-download.handler.js";
import { DeclareOwnEstablishmentCommand } from "../../commands/declare-own-establishment.command.js";
import { FakeDebitedAccounts } from "../../commands/__tests__/account-bank-export-doubles.js";
import { collectionTestWorld } from "../../commands/__tests__/collection-test-world.js";
import { OneEntity, entityRecord } from "../../commands/__tests__/mandate-bank-export-doubles.js";
import { ExportCollectionTestBankAccountQuery } from "../collection-test-queries.js";
import { ExportCollectionTestBankAccountHandler } from "../export-collection-test-bank-account.handler.js";

const ENTITY = entityRecord();
const RUM = "RUM-NOUS";
const OURS = debitedAccount("nous", { companyId: OUR_COMPANY, iban: IBAN_A });
const OTHER = debitedAccount("autre", { iban: IBAN_B });

/** Le monde de l'essai, son mandat (BIC compris) chez `le1`, et les comptes débités. */
async function world(declared = true) {
  const w = collectionTestWorld();
  w.mandates.mandates = [
    mandate(OUR_COMPANY, { creditorId: ENTITY.id, reference: RUM, bic: "BNPAFRPPXXX" }),
  ];
  if (declared) {
    await w.declare.execute(new DeclareOwnEstablishmentCommand(OUR_COMPANY, "staff_1"));
  }
  const accounts = new FakeDebitedAccounts();
  accounts.exportable = [OTHER, OURS];
  const handler = new ExportCollectionTestBankAccountHandler(
    w.companies,
    w.mandates,
    accounts,
    new OneEntity(ENTITY),
  );
  const run = () => handler.execute(new ExportCollectionTestBankAccountQuery(OUR_COMPANY));
  return { ...w, accounts, run };
}

describe("exporter le RIB d'un établissement pour la banque", () => {
  it("rend UNE ligne, au rendu même de l'export des RIB, pour le compte du mandat", async () => {
    const w = await world();

    const file = await w.run();

    expect(file.csv).toBe(accountBankCsvOf([OURS]));
    const lines = file.csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("");
    expect(lines[0]).toContain("Titulaire nous");
    expect(lines[0]).toContain(IBAN_A.slice(4));
    expect(lines[0]).not.toContain("Titulaire autre");
    expect(file.fileName).toBe(`ESSAI-rib-banque-${ENTITY.siren}-${RUM}.csv`);
    expect(w.accounts.asked).toEqual([ENTITY.id]);
    expect(file.company).toEqual({ companyId: OUR_COMPANY, name: "Folie Douce Val" });
    expect(file.legalEntity).toEqual({ id: ENTITY.id, name: ENTITY.name });
  });

  it("refuse une société qui n'est pas déclarée à nous", async () => {
    const w = await world(false);
    await expect(w.run()).rejects.toThrow(NotOwnEstablishmentError);
  });

  it("refuse un RIB sans BIC, en le disant", async () => {
    const w = await world();
    w.mandates.mandates = [mandate(OUR_COMPANY, { creditorId: ENTITY.id, reference: RUM })];
    w.accounts.exportable = [OTHER];
    await expect(w.run()).rejects.toThrow(CollectionTestBankAccountNotExportableError);
    await expect(w.run()).rejects.toThrow(/BIC/u);
  });

  it("refuse un RIB que l'entité ne débite pas, sans jamais citer l'IBAN", async () => {
    const w = await world();
    w.accounts.exportable = [OTHER];
    const refusal: unknown = await w.run().catch((caught: unknown) => caught);
    expect(refusal).toBeInstanceOf(CollectionTestBankAccountNotExportableError);
    const message = refusal instanceof Error ? refusal.message : "";
    expect(message).toContain("n'est pas parmi les comptes");
    expect(message).not.toContain(IBAN_A.slice(4));
  });
});

describe("journaliser le téléchargement du RIB d'essai", () => {
  it("inscrit un fait sur la société, sans IBAN", async () => {
    const events = new RecordingPublisher();
    const at = new Date(0);
    const handler = new RecordCollectionTestBankAccountDownloadHandler(new FixedClock(at), events);

    await handler.execute(
      new RecordCollectionTestBankAccountDownloadCommand(
        { companyId: OUR_COMPANY, name: "Folie Douce Val" },
        { id: ENTITY.id, name: ENTITY.name },
        "staff_1",
      ),
    );

    const facts = events.traced.map((event) => event.journalFact());
    expect(facts).toEqual([
      {
        type: "collection.test_bank_account_exported",
        subjectType: "company",
        subjectId: OUR_COMPANY,
        occurredAt: at,
        payload: {
          subjectLabel: "Folie Douce Val",
          legalEntity: { id: ENTITY.id, name: ENTITY.name },
        },
      },
    ]);
  });
});
