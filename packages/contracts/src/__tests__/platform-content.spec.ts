import { DEFAULT_FOOTER_CONTENT } from "../platform-content.defaults.js";
import {
  commercialContactSchema,
  DEFAULT_COMMERCIAL_CONTACT_EMAIL,
  footerContentSchema,
  legalIdentitySchema,
} from "../platform-content.js";

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

  it("retient le nom d'enseigne d'un contenu enregistré avant qu'il existe", () => {
    // Le champ est arrivé après la mise en service : une ligne déjà en base ne
    // le porte pas. Elle doit continuer à se lire — sans quoi le pied de page
    // entier retomberait sur le contenu de départ pour un mot manquant.
    expect(legalIdentitySchema.parse({}).brandName).toBe("La Folie Coffee");
  });

  it("refuse deux fois le même réseau, et accepte l'absence de réseau", () => {
    expect(legalIdentitySchema.parse({}).socials).toEqual([]);
    expect(
      legalIdentitySchema.safeParse({
        socials: [
          { channel: "instagram", url: "https://a" },
          { channel: "tiktok", url: "https://b" },
        ],
      }).success,
    ).toBe(true);
    expect(
      legalIdentitySchema.safeParse({
        socials: [
          { channel: "instagram", url: "https://a" },
          { channel: "instagram", url: "https://b" },
        ],
      }).success,
    ).toBe(false);
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

describe("le contact commercial de Mon compte", () => {
  /**
   * 🔴 Une ligne de production enregistrée AVANT ce champ doit se relire
   * intacte. Si son parse échouait, l'API servirait le contenu de départ à la
   * place de ce que le staff a saisi.
   */
  it("une ligne enregistrée sans lui se relit avec le défaut, et garde tout le reste", () => {
    // `undefined` et non une clé retirée : zod les traite pareil (le défaut s'applique),
    // et le reste de la ligne garde ses types sans variable jetable.
    const saved = { ...DEFAULT_FOOTER_CONTENT, commercialContact: undefined };
    const edited = {
      ...saved,
      identity: { ...saved.identity, email: "standard@lafoliecoffee.fr", phone: "04 00 00 00 00" },
    };

    const parsed = footerContentSchema.safeParse(edited);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.commercialContact).toEqual({
        email: "celine@lafoliedouce.com",
        phone: "",
        phoneHref: "",
      });
      expect(parsed.data.identity).toEqual(edited.identity);
      expect(parsed.data.fr).toEqual(edited.fr);
      expect(parsed.data.legalMentions).toEqual(edited.legalMentions);
    }
  });

  it("reste à part de l'identité : l'une ne réécrit pas l'autre", () => {
    const parsed = footerContentSchema.parse({
      ...DEFAULT_FOOTER_CONTENT,
      commercialContact: { email: "celine@lafoliedouce.com", phone: "", phoneHref: "" },
    });
    expect(parsed.identity.email).toBe(DEFAULT_FOOTER_CONTENT.identity.email);
    expect(parsed.commercialContact.email).toBe("celine@lafoliedouce.com");
  });

  it("refuse une adresse e-mail qui n'en est pas une, mais pas l'absence", () => {
    expect(commercialContactSchema.safeParse({ email: "celine@" }).success).toBe(false);
    expect(commercialContactSchema.safeParse({ email: "" }).success).toBe(true);
    expect(
      footerContentSchema.safeParse({
        ...DEFAULT_FOOTER_CONTENT,
        commercialContact: { email: "pas une adresse", phone: "", phoneHref: "" },
      }).success,
    ).toBe(false);
  });

  it("le contenu de départ et le défaut du schéma portent la même adresse", () => {
    expect(DEFAULT_FOOTER_CONTENT.commercialContact.email).toBe(DEFAULT_COMMERCIAL_CONTACT_EMAIL);
    expect(DEFAULT_FOOTER_CONTENT.commercialContact.phone).toBe("");
  });
});

describe("le contenu de départ", () => {
  it("satisfait son propre schéma — sinon le repli du serveur casse en silence", () => {
    // Le défaut est servi tant que personne n'a rien enregistré, ET c'est le
    // repli du front quand le réseau ne répond pas. S'il était invalide,
    // l'erreur ne se verrait qu'en production, au pire moment.
    expect(footerContentSchema.safeParse(DEFAULT_FOOTER_CONTENT).success).toBe(true);
  });

  it("n'invente AUCUN numéro d'immatriculation", () => {
    // Un SIRET plausible sur un site marchand est une mention légale fausse.
    // Le back-office est là pour le saisir ; le rendu omet ce qui est vide.
    expect(DEFAULT_FOOTER_CONTENT.identity.siret).toBe("");
    expect(DEFAULT_FOOTER_CONTENT.identity.rcs).toBe("");
    expect(DEFAULT_FOOTER_CONTENT.identity.vat).toBe("");
  });

  it("porte les trois langues, chacune avec ses quatre sections", () => {
    for (const locale of ["fr", "en", "it"] as const) {
      const content = DEFAULT_FOOTER_CONTENT[locale];
      expect(content.brand.tagline).not.toBe("");
      expect(content.houses.items.length).toBeGreaterThan(0);
      expect(content.order.links.length).toBeGreaterThan(0);
      expect(content.help.links.length).toBeGreaterThan(0);
      expect(content.legal.links.length).toBeGreaterThan(0);
    }
  });
});
