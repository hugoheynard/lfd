import {
  reservedVisibilityOf,
  UnknownReservedVisibilityError,
} from "../reserved-visibility-column.js";

describe("reservedVisibilityOf — relire la colonne", () => {
  it("une ligne de décision absente vaut le défaut de la base : invisible", () => {
    expect(reservedVisibilityOf(undefined)).toBe("hidden");
  });

  it.each(["hidden", "visible_locked"] as const)("rend %s tel quel", (value) => {
    expect(reservedVisibilityOf(value)).toBe(value);
  });

  it("refuse une valeur que la contrainte aurait dû refuser", () => {
    expect(() => reservedVisibilityOf("visible")).toThrow(UnknownReservedVisibilityError);
  });
});
