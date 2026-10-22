import {
  CollectionTestAmbiguousMandateError,
  CollectionTestMandateNotExportableError,
  NotOwnEstablishmentError,
} from "../../../domain/errors/collection-test-errors.js";
import { BankExportWithoutCreditorIdentifierError } from "../../../domain/errors/mandate-bank-export-errors.js";
import type { MandateForBankExport } from "../../../domain/ports/mandates-for-bank-export.reader.js";
import { OUR_COMPANY } from "../../../domain/entities/__tests__/collection-test-fixtures.js";
import { mandate } from "../../../domain/services/__tests__/collection-fixtures.js";
import { DeclareOwnEstablishmentCommand } from "../../commands/declare-own-establishment.command.js";
import { collectionTestWorld } from "../../commands/__tests__/collection-test-world.js";
import {
  FakeBankMandates,
  IBAN_A,
  OneEntity,
  entityRecord,
} from "../../commands/__tests__/mandate-bank-export-doubles.js";
import { FakeCandidates, Steps } from "../../commands/__tests__/collection-doubles.js";
import { ExportCollectionTestMandateQuery } from "../collection-test-queries.js";
import { ExportCollectionTestMandateHandler } from "../export-collection-test-mandate.handler.js";

const ENTITY = entityRecord();
const MANDATE_ID = `m_${OUR_COMPANY}`;
const RUM = "RUM-NOUS";

function ourBankMandate(): MandateForBankExport {
  return {
    mandateId: MANDATE_ID,
    reference: RUM,
    debtorCompanyId: OUR_COMPANY,
    iban: IBAN_A,
    bic: "BNPAFRPP",
    signedAt: new Date("2026-09-14T22:00:00.000Z"),
    scheme: "B2B",
    paymentType: "recurrent",
  };
}

/** Le monde de l'essai, son mandat chez l'entité `le1`, et la banque. */
async function world(declared = true) {
  const w = collectionTestWorld();
  w.mandates.mandates = [mandate(OUR_COMPANY, { creditorId: ENTITY.id, reference: RUM })];
  if (declared) {
    await w.declare.execute(new DeclareOwnEstablishmentCommand(OUR_COMPANY, "staff_1"));
  }
  const bank = new FakeBankMandates();
  bank.exportable = [ourBankMandate(), { ...ourBankMandate(), mandateId: "m_autre" }];
  const entities = new OneEntity(ENTITY);
  const handler = new ExportCollectionTestMandateHandler(
    w.companies,
    w.mandates,
    bank,
    entities,
    new FakeCandidates(new Steps()),
  );
  const run = () => handler.execute(new ExportCollectionTestMandateQuery(OUR_COMPANY));
  return { ...w, bank, entities, run };
}

describe("exporter le mandat d'un établissement pour la banque", () => {
  it("rend UNE ligne, au format de l'export des mandats (A à H, 17 cellules, CRLF)", async () => {
    const w = await world();

    const file = await w.run();

    const lines = file.csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("");
    expect(lines[0]).toMatch(
      new RegExp(
        `^RUM-NOUS;FR72ZZZ123456;[^;]+;${IBAN_A};BNPAFRPP;15/09/2026;RCUR;B2B;(;){9}$`,
        "u",
      ),
    );
    expect(file.fileName).toBe(`ESSAI-mandat-banque-${ENTITY.siren}-RUM-NOUS.csv`);
    expect(w.bank.asked).toEqual([ENTITY.id]);
  });

  it("refuse une société qui n'est pas déclarée à nous", async () => {
    const w = await world(false);
    await expect(w.run()).rejects.toThrow(NotOwnEstablishmentError);
  });

  it("refuse deux mandats actifs chez nos entités : pas de créancier deviné", async () => {
    const w = await world();
    w.mandates.mandates = [
      mandate(OUR_COMPANY, { creditorId: ENTITY.id }),
      mandate(OUR_COMPANY, { creditorId: ENTITY.id, mandateId: "m2", reference: "RUM-2" }),
    ];
    await expect(w.run()).rejects.toThrow(CollectionTestAmbiguousMandateError);
  });

  it("refuse un mandat que l'export écarte, en disant pourquoi (sans BIC)", async () => {
    const w = await world();
    w.bank.exportable = [];
    w.bank.excluded = [
      {
        mandateId: MANDATE_ID,
        reference: "RUM-NOUS",
        debtorCompanyId: OUR_COMPANY,
        reason: "no_bic",
      },
    ];
    await expect(w.run()).rejects.toThrow(CollectionTestMandateNotExportableError);
    await expect(w.run()).rejects.toThrow(/BIC/u);
  });

  it("refuse une entité sans ICS : la colonne B serait vide", async () => {
    const w = await world();
    w.entities.record = entityRecord(false);
    await expect(w.run()).rejects.toThrow(BankExportWithoutCreditorIdentifierError);
  });
});
