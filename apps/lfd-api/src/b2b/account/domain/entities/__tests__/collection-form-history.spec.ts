import {
  CollectionFormNeedsBillingFollowError,
  CollectionFormSameInstantError,
} from "../../errors/collection-form-errors.js";
import { CollectionFormHistory } from "../collection-form-history.js";

/** Dates comparées entre elles seulement, jamais à l'horloge (CLAUDE.md §5). */
const MARCH = new Date("2030-03-01T08:00:00.000Z");
const APRIL = new Date("2030-04-01T08:00:00.000Z");

describe("CollectionFormHistory — la forme de prélèvement datée (plan-sous-comptes §2.1 ter)", () => {
  it("vaut le mandat du principal tant qu'aucune décision n'est posée", () => {
    expect(CollectionFormHistory.reconstitute("chalet", []).formAt(MARCH)).toBe(
      "principal_mandate",
    );
  });

  it("ouvre une période, puis la ferme au choix suivant — rien ne s'efface", () => {
    const history = CollectionFormHistory.reconstitute("chalet", []);

    expect(history.choose("own_mandate_principal_iban", MARCH, true)).toBe(true);
    expect(history.choose("own_iban", APRIL, true)).toBe(true);

    expect(history.periods).toEqual([
      { form: "own_mandate_principal_iban", validFrom: MARCH, validTo: APRIL },
      { form: "own_iban", validFrom: APRIL, validTo: null },
    ]);
    // La relecture à date : un cycle clos en mars garde la forme d'alors.
    expect(history.formAt(new Date("2030-03-20T00:00:00.000Z"))).toBe("own_mandate_principal_iban");
    expect(history.formAt(APRIL)).toBe("own_iban");
  });

  it("reposer la forme en vigueur ne change rien", () => {
    const history = CollectionFormHistory.reconstitute("chalet", [
      { form: "own_iban", validFrom: MARCH, validTo: null },
    ]);

    expect(history.choose("own_iban", APRIL, true)).toBe(false);
    expect(history.periods).toHaveLength(1);
  });

  it("refuse un choix pour une société qui ne suit pas `billing`", () => {
    const history = CollectionFormHistory.reconstitute("club", []);

    expect(() => history.choose("own_iban", MARCH, false)).toThrow(
      CollectionFormNeedsBillingFollowError,
    );
  });

  it("refuse deux décisions au même instant — la seconde fermerait la première sur elle-même", () => {
    const history = CollectionFormHistory.reconstitute("chalet", [
      { form: "own_iban", validFrom: MARCH, validTo: null },
    ]);

    expect(() => history.choose("principal_mandate", MARCH, true)).toThrow(
      CollectionFormSameInstantError,
    );
  });
});
