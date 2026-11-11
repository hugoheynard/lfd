import { amendCompanyMercurialePayloadSchema } from "../index.js";

describe("l'avenant annonce le dernier avenant vu", () => {
  const base = { reason: "Renégociation" };

  it("reste facultatif : un appelant qui ne part pas d'un aperçu n'en dit rien", () => {
    expect(amendCompanyMercurialePayloadSchema.parse(base).basedOnAmendmentId).toBeUndefined();
  });

  it("distingue « aucun avenant vu » (`null`) d'un identifiant", () => {
    expect(
      amendCompanyMercurialePayloadSchema.parse({ ...base, basedOnAmendmentId: null })
        .basedOnAmendmentId,
    ).toBeNull();
    expect(
      amendCompanyMercurialePayloadSchema.parse({ ...base, basedOnAmendmentId: "amd_1" })
        .basedOnAmendmentId,
    ).toBe("amd_1");
  });

  it("refuse un identifiant vide", () => {
    expect(
      amendCompanyMercurialePayloadSchema.safeParse({ ...base, basedOnAmendmentId: "" }).success,
    ).toBe(false);
  });
});
