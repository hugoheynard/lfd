import {
  BankExportAlreadyImportedError,
  DuplicateMandateInBankExportError,
  NothingToExportToBankError,
} from "../../errors/mandate-bank-export-errors.js";
import { MandateBankExport } from "../mandate-bank-export.js";

const CREATED = { at: new Date("2026-10-09T09:00:00.000Z"), staffId: "staff_1" };
const LINE = { mandateId: "m1", rum: "RUM-1", accountFingerprint: "a".repeat(64) };

function exported(): MandateBankExport {
  return MandateBankExport.export({
    id: "exp_1",
    legalEntityId: "le1",
    created: CREATED,
    lines: [LINE, { ...LINE, mandateId: "m2", rum: "RUM-2" }],
  });
}

describe("un export des mandats pour la banque", () => {
  it("naît non importé, avec ses lignes", () => {
    const bankExport = exported();
    expect(bankExport.mandateCount).toBe(2);
    expect(bankExport.toPersistence().imported).toBeNull();
  });

  it("refuse un export vide", () => {
    expect(() =>
      MandateBankExport.export({ id: "e", legalEntityId: "le1", created: CREATED, lines: [] }),
    ).toThrow(NothingToExportToBankError);
  });

  it("refuse un même mandat deux fois", () => {
    expect(() =>
      MandateBankExport.export({
        id: "e",
        legalEntityId: "le1",
        created: CREATED,
        lines: [LINE, LINE],
      }),
    ).toThrow(DuplicateMandateInBankExportError);
  });

  it("se marque importé une fois, avec son instant et son auteur", () => {
    const bankExport = exported();
    const stamp = { at: new Date("2026-10-10T08:00:00.000Z"), staffId: "staff_2" };
    bankExport.markImported(stamp);
    expect(bankExport.toPersistence().imported).toEqual(stamp);
  });

  it("refuse un second marquage, et garde le premier", () => {
    const bankExport = exported();
    const first = { at: new Date("2026-10-10T08:00:00.000Z"), staffId: "staff_2" };
    bankExport.markImported(first);
    expect(() => bankExport.markImported({ ...first, staffId: "staff_3" })).toThrow(
      BankExportAlreadyImportedError,
    );
    expect(bankExport.toPersistence().imported).toEqual(first);
  });
});
