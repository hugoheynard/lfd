import { footerContentSchema, legalIdentitySchema } from "../platform-content.js";

describe("l'identité légale", () => {
  it("accepte le VIDE — un numéro qu'on n'a pas ne s'invente pas", () => {
    const parsed = legalIdentitySchema.parse({});
    expect(parsed.siret).toBe("");
    expect(parsed.vat).toBe("");
    expect(parsed.company).toBe("");
  });

  it("tolère les espaces de lecture d'un SIRET, et refuse le compte faux", () => {
    expect(legalIdentitySchema.parse({ siret: "812 456 789 00021" }).siret).toBe(
      "812 456 789 00021",
    );
    expect(legalIdentitySchema.safeParse({ siret: "812 456" }).success).toBe(false);
  });

  it("reconnaît une TVA intracommunautaire, quelle que soit la casse", () => {
    expect(legalIdentitySchema.safeParse({ vat: "FR45812456789" }).success).toBe(true);
    expect(legalIdentitySchema.safeParse({ vat: "fr45812456789" }).success).toBe(true);
    expect(legalIdentitySchema.safeParse({ vat: "FR458" }).success).toBe(false);
  });

  it("refuse une adresse e-mail qui n'en est pas une, mais pas l'absence", () => {
    expect(legalIdentitySchema.safeParse({ email: "" }).success).toBe(true);
    expect(legalIdentitySchema.safeParse({ email: "contact@lafoliecoffee.fr" }).success).toBe(true);
    expect(legalIdentitySchema.safeParse({ email: "contact@" }).success).toBe(false);
  });
});

describe("le pied de page", () => {
  const locale = {
    brand: { tagline: "Boulangerie d’altitude", pitch: "Pain au levain." },
    houses: {
      head: "Les maisons",
      items: [
        {
          name: "Le Labo",
          street: "Route de la Balme",
          city: "73150 Val d’Isère",
          hours: "7 h – 19 h",
        },
      ],
    },
    order: { head: "Commander", links: ["Retrait au Labo"] },
    help: { head: "Aide", phoneHours: "7 h – 19 h", links: ["FAQ"] },
    legal: { pay: "Paiement sécurisé.", vat: "Prix TTC.", links: ["Mentions légales"] },
  };

  it("exige les TROIS langues — une seule ne passe pas", () => {
    expect(footerContentSchema.safeParse({ identity: {}, fr: locale }).success).toBe(false);
    expect(
      footerContentSchema.safeParse({ identity: {}, fr: locale, en: locale, it: locale }).success,
    ).toBe(true);
  });

  it("refuse une section vidée de ses liens : une colonne sans entrée n'est pas une colonne", () => {
    const noLinks = { ...locale, order: { head: "Commander", links: [] } };
    expect(
      footerContentSchema.safeParse({ identity: {}, fr: noLinks, en: locale, it: locale }).success,
    ).toBe(false);
  });

  it("refuse une maison sans son code postal — c'est ce qu'on copie dans un GPS", () => {
    const noCity = {
      ...locale,
      houses: {
        head: "Les maisons",
        items: [{ name: "Le Labo", street: "Route de la Balme", city: "", hours: "7 h" }],
      },
    };
    expect(
      footerContentSchema.safeParse({ identity: {}, fr: noCity, en: locale, it: locale }).success,
    ).toBe(false);
  });
});
