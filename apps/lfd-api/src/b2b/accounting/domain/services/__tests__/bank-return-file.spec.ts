import { InvalidBankReturnFileError } from "../../errors/bank-return-file-errors.js";
import { readBankReturnFile } from "../bank-return-file.js";
import { camt054, pain002 } from "./bank-return-file-fixtures.js";

describe("la lecture d'un fichier de retours de la banque (R5b)", () => {
  it("pain.002 : les seules transactions rejetées, datées du rapport, montant en centimes", () => {
    const file = readBankReturnFile(
      pain002("2026-10-16", [
        { endToEndId: "E2E-1", amount: "123.45", code: "AM04" },
        { endToEndId: "E2E-2", amount: "1000", code: "MD01", additional: "Pas de mandat" },
      ]),
    );

    expect(file).toEqual({
      format: "pain002",
      entries: [
        {
          endToEndId: "E2E-1",
          kind: "reject",
          reasonCode: "AM04",
          reasonLabel: null,
          returnedOn: "2026-10-16",
          amountCents: 12_345,
        },
        {
          endToEndId: "E2E-2",
          kind: "reject",
          reasonCode: "MD01",
          reasonLabel: "Pas de mandat",
          returnedOn: "2026-10-16",
          amountCents: 100_000,
        },
      ],
    });
  });

  it("camt.054 : les retours (RtrInf), MD06 en remboursement, l'écriture sans retour ignorée", () => {
    const file = readBankReturnFile(
      camt054("2026-10-20", [
        { endToEndId: "E2E-3", amount: "50.5", code: "AC04" },
        { endToEndId: "E2E-4", amount: "12.00", code: "MD06" },
      ]),
    );

    expect(file.format).toBe("camt054");
    expect(file.entries).toEqual([
      expect.objectContaining({ endToEndId: "E2E-3", kind: "return", amountCents: 5_050 }),
      expect.objectContaining({ endToEndId: "E2E-4", kind: "refund_request", reasonCode: "MD06" }),
    ]);
    expect(file.entries[0]?.returnedOn).toBe("2026-10-20");
  });

  it("un motif propriétaire devient « autre » avec ses mots", () => {
    const file = readBankReturnFile(
      pain002("2026-10-16", [{ endToEndId: "E2E-5", amount: "1.00", proprietary: "R-BANQUE-7" }]),
    );

    expect(file.entries[0]).toMatchObject({ reasonCode: "NARR", reasonLabel: "R-BANQUE-7" });
  });

  it("refuse un fichier qui n'est ni l'un ni l'autre", () => {
    expect(() => readBankReturnFile("<Document><Autre/></Document>")).toThrow(
      InvalidBankReturnFileError,
    );
  });

  it("refuse un montant illisible ou dans une autre devise", () => {
    const bad = pain002("2026-10-16", [{ endToEndId: "E", amount: "12,50" }]);
    const usd = pain002("2026-10-16", [{ endToEndId: "E", amount: "12.50" }]).replace(
      'Ccy="EUR"',
      'Ccy="USD"',
    );

    expect(() => readBankReturnFile(bad)).toThrow(InvalidBankReturnFileError);
    expect(() => readBankReturnFile(usd)).toThrow(/USD/u);
  });

  it("refuse une transaction rejetée sans référence de bout en bout", () => {
    const xml = pain002("2026-10-16", [{ endToEndId: "E", amount: "1.00" }]).replace(
      "<OrgnlEndToEndId>E</OrgnlEndToEndId>",
      "",
    );

    expect(() => readBankReturnFile(xml)).toThrow(/OrgnlEndToEndId/u);
  });
});
