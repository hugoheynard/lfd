import { InvalidBankCollectionLimitError } from "../../errors/bank-collection-limits-errors.js";
import { LegalAddress } from "../../value-objects/legal-address.js";
import { Siren } from "../../value-objects/siren.js";
import { LegalEntity } from "../legal-entity.js";

const NONE = { perDebitCents: null, perRemittanceCents: null, monthlyCents: null };

function declared(): LegalEntity {
  return LegalEntity.declare({
    id: "01JBXY000000000000000000LE",
    name: "La Folie Coffee",
    legalForm: "SAS",
    siren: Siren.create("552100554"),
    address: LegalAddress.create({
      line1: "12 rue des Lilas",
      line2: "",
      postalCode: "75011",
      city: "Paris",
      countryCode: "FR",
    }),
    rcs: "Paris B 552 100 554",
    shareCapitalCents: 1_000_000,
    vatNumber: "FR40552100554",
  });
}

describe("LegalEntity — les plafonds de la banque (PL1)", () => {
  it("part sans plafond, pour chaque schéma, et n'a rien à écrire", () => {
    const entity = declared();

    expect(entity.bankCollectionLimits("B2B").isEmpty).toBe(true);
    expect(entity.bankCollectionLimits("CORE").isEmpty).toBe(true);
    expect(entity.bankLimitsToPersistence()).toEqual([]);
  });

  it("règle un schéma sans toucher l'autre", () => {
    const entity = declared();

    expect(entity.setBankCollectionLimits("B2B", { ...NONE, perDebitCents: 500_000 })).toBe(true);

    expect(entity.bankCollectionLimits("B2B").perDebitCents).toBe(500_000);
    expect(entity.bankCollectionLimits("CORE").isEmpty).toBe(true);
    expect(entity.bankLimitsToPersistence()).toEqual([
      { scheme: "B2B", ...NONE, perDebitCents: 500_000 },
    ]);
  });

  it("dit « rien n'a changé » à une saisie rejouée", () => {
    const entity = declared();
    entity.setBankCollectionLimits("B2B", { ...NONE, monthlyCents: 100 });

    expect(entity.setBankCollectionLimits("B2B", { ...NONE, monthlyCents: 100 })).toBe(false);
    expect(entity.setBankCollectionLimits("CORE", NONE)).toBe(false);
  });

  it("garde à écrire un plafond remis à vide : effacer est une écriture", () => {
    const entity = declared();
    entity.setBankCollectionLimits("B2B", { ...NONE, monthlyCents: 100 });

    entity.setBankCollectionLimits("B2B", NONE);

    expect(entity.bankLimitsToPersistence()).toEqual([{ scheme: "B2B", ...NONE }]);
  });

  it("refuse un montant ≤ 0 sans rien changer", () => {
    const entity = declared();

    expect(() => entity.setBankCollectionLimits("B2B", { ...NONE, perRemittanceCents: 0 })).toThrow(
      InvalidBankCollectionLimitError,
    );
    expect(entity.bankCollectionLimits("B2B").isEmpty).toBe(true);
  });

  it("se reconstitue depuis ses lignes, et revalide", () => {
    const entity = declared();
    entity.setBankCollectionLimits("CORE", {
      perDebitCents: 1,
      perRemittanceCents: 2,
      monthlyCents: 3,
    });
    const rows = entity.bankLimitsToPersistence();

    const reloaded = LegalEntity.reconstitute(entity.toPersistence(), rows);

    expect(reloaded.bankLimitsToPersistence()).toEqual(rows);
    expect(() =>
      LegalEntity.reconstitute(entity.toPersistence(), [
        { scheme: "B2B", ...NONE, monthlyCents: -1 },
      ]),
    ).toThrow(InvalidBankCollectionLimitError);
  });
});
