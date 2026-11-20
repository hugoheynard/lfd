import {
  counterParticularCardSchema,
  counterParticularCreatePayloadSchema,
  counterParticularSearchQuerySchema,
} from "../counter-particular.js";

describe("contrat de la saisie particulier au comptoir", () => {
  it("accepte une recherche et refuse une chaîne démesurée", () => {
    expect(counterParticularSearchQuerySchema.safeParse({ q: "06 12" }).success).toBe(true);
    expect(counterParticularSearchQuerySchema.safeParse({ q: "x".repeat(121) }).success).toBe(
      false,
    );
  });

  it("exige les trois champs de la création", () => {
    expect(
      counterParticularCreatePayloadSchema.safeParse({ firstName: "Jean", email: "j@x.fr" })
        .success,
    ).toBe(false);
  });

  it("porte l'indicateur de compte connectable sur la carte", () => {
    const parsed = counterParticularCardSchema.safeParse({
      id: "u1",
      firstName: "Jean",
      lastName: "",
      maskedEmail: "j***@x.fr",
      maskedPhone: "06 •• •• •• 12",
    });
    expect(parsed.success).toBe(false);
  });
});
