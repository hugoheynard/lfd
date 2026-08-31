import { isForeignKeyViolation, isUniqueViolation } from "../prisma-violations.js";

/**
 * Ces deux fonctions sont le seul point qui décide si une erreur Postgres brute
 * devient `IngredientKeyTakenError` / `IngredientInUseError` (ou leur pendant
 * appellation) — une régression ici ferait fuir une `PrismaClientKnownRequestError`
 * jusqu'au filtre HTTP générique, avec un message illisible pour le staff.
 */
describe("isUniqueViolation", () => {
  it("reconnaît le code `P2002`", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
  });

  it("refuse un code voisin — `P2003` n'est pas une unicité", () => {
    expect(isUniqueViolation({ code: "P2003" })).toBe(false);
  });

  it("refuse une erreur sans code du tout", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });

  it("refuse `null`, `undefined` et un primitif", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("P2002")).toBe(false);
  });
});

describe("isForeignKeyViolation", () => {
  it("reconnaît le code `P2003`", () => {
    expect(isForeignKeyViolation({ code: "P2003" })).toBe(true);
  });

  it("refuse un code voisin — `P2002` n'est pas une clé étrangère", () => {
    expect(isForeignKeyViolation({ code: "P2002" })).toBe(false);
  });

  it("refuse `null`, `undefined` et un primitif", () => {
    expect(isForeignKeyViolation(null)).toBe(false);
    expect(isForeignKeyViolation(undefined)).toBe(false);
    expect(isForeignKeyViolation(42)).toBe(false);
  });
});
