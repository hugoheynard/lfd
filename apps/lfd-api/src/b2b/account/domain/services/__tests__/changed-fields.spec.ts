import { changedFields } from "../changed-fields.js";

const KEYS = ["enseigne", "vatNumber", "siret"] as const;

describe("changedFields", () => {
  it("nomme les champs changés, dans l'ordre des clés, et rien de leur valeur", () => {
    expect(
      changedFields(
        KEYS,
        { enseigne: "Le Fournil", vatNumber: "", siret: "" },
        { enseigne: "Le Fournil", vatNumber: "FR12345678901", siret: "81245678900021" },
      ),
    ).toEqual(["vatNumber", "siret"]);
  });

  it("ne rend rien quand rien n'a changé", () => {
    const same = { enseigne: "A", vatNumber: "B", siret: "C" };
    expect(changedFields(KEYS, same, { ...same })).toEqual([]);
  });
});
