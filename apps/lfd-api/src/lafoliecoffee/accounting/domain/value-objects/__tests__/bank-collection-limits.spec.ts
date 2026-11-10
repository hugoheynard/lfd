import { InvalidBankCollectionLimitError } from "../../errors/bank-collection-limits-errors.js";
import { BankCollectionLimits } from "../bank-collection-limits.js";

const NONE = { perDebitCents: null, perRemittanceCents: null, monthlyCents: null };

describe("BankCollectionLimits", () => {
  it("accepte trois plafonds absents : « non renseigné », rien n'est inventé", () => {
    const limits = BankCollectionLimits.create(NONE);

    expect(limits).toMatchObject(NONE);
    expect(limits.isEmpty).toBe(true);
    expect(limits.equals(BankCollectionLimits.empty())).toBe(true);
  });

  it("garde les montants renseignés, en centimes", () => {
    const limits = BankCollectionLimits.create({
      perDebitCents: 500_000,
      perRemittanceCents: 2_000_000,
      monthlyCents: null,
    });

    expect(limits).toMatchObject({ perDebitCents: 500_000, perRemittanceCents: 2_000_000 });
    expect(limits.monthlyCents).toBeNull();
    expect(limits.isEmpty).toBe(false);
  });

  it("n'oppose PAS l'ordre unitaire ≤ remise ≤ mensuel — la banque n'en a rien dit", () => {
    const limits = BankCollectionLimits.create({
      perDebitCents: 9_000_000,
      perRemittanceCents: 100,
      monthlyCents: 50,
    });

    expect(limits.perDebitCents).toBe(9_000_000);
  });

  it.each([
    ["perDebitCents", 0, /Plafond unitaire/u],
    ["perRemittanceCents", -100, /Plafond par remise/u],
    ["monthlyCents", 12.5, /Plafond mensuel/u],
  ])("refuse %s = %s, en nommant le plafond", (field, value, name) => {
    const attempt = () => BankCollectionLimits.create({ ...NONE, [field]: value });

    expect(attempt).toThrow(InvalidBankCollectionLimitError);
    expect(attempt).toThrow(name);
  });

  it("distingue deux jeux qui diffèrent d'un seul plafond", () => {
    const a = BankCollectionLimits.create({ ...NONE, monthlyCents: 100 });
    const b = BankCollectionLimits.create({ ...NONE, monthlyCents: 200 });

    expect(a.equals(b)).toBe(false);
  });
});
