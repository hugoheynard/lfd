import type { MailCharterSettings } from "../charter-settings.js";
import { contrastRatio, isHexColor } from "../contrast.js";
import { isMailSpace, mailSpaceOfCharter, MAIL_SPACES } from "../mail-spaces.js";
import { validateMailCharter, validateMailCharterForPublication } from "../validate-charter.js";

const SETTINGS: MailCharterSettings = {
  logo: { src: "https://media.lafoliedouce.fr/logo.png", alt: { fr: "La Folie Douce" } },
  colors: {
    page: "#fdfcfb",
    card: "#ffffff",
    text: "#0f172a",
    mutedText: "#64748b",
    primary: "#24448f",
    border: "#e2e8f0",
  },
  darkColors: { page: "#0b1220", card: "#111a2e", text: "#e5e9f2", border: "#26324a" },
  headingFont: {
    family: "Chunk",
    url: "https://boutique.example/brand/fonts/chunk-400.woff2",
    fallback: "'Arial Black',Impact,sans-serif",
  },
  footer: { fr: "La Folie Douce — Lyon" },
};

describe("les espaces", () => {
  it("range les e-mails internes dans l'espace La Folie Douce", () => {
    expect(mailSpaceOfCharter("internal")).toBe("lfd");
    expect(mailSpaceOfCharter("lfc")).toBe("lfc");
    expect(mailSpaceOfCharter("lfd")).toBe("lfd");
    expect(MAIL_SPACES).toEqual(["lfc", "lfd"]);
  });

  it("ne reconnaît pas `internal` comme un espace", () => {
    expect(isMailSpace("internal")).toBe(false);
    expect(isMailSpace("lfd")).toBe(true);
  });
});

describe("le contraste", () => {
  it("rend 21:1 pour le noir sur blanc, et 1:1 pour deux couleurs égales", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#24448f", "#24448f")).toBeCloseTo(1, 5);
  });

  it("est symétrique", () => {
    expect(contrastRatio("#64748b", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#64748b"),
      10,
    );
  });

  it("n'accepte que la forme #rrggbb", () => {
    expect(isHexColor("#1a3157")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("navy")).toBe(false);
  });
});

describe("validateMailCharter (enregistrement)", () => {
  it("accepte la charte d'aujourd'hui", () => {
    expect(validateMailCharter(SETTINGS)).toEqual([]);
  });

  it("refuse une couleur qui n'est pas #rrggbb, en nommant le réglage", () => {
    const violations = validateMailCharter({
      ...SETTINGS,
      darkColors: { ...SETTINGS.darkColors, card: "red" },
    });
    expect(violations).toEqual([
      expect.objectContaining({ code: "charter-color-invalid", field: "darkColors.card" }),
    ]);
  });

  it("admet un logo pas encore choisi, refuse une adresse hors https", () => {
    expect(validateMailCharter({ ...SETTINGS, logo: { src: "", alt: {} } })).toEqual([]);
    expect(
      validateMailCharter({ ...SETTINGS, logo: { src: "ftp://x/logo.png", alt: {} } }),
    ).toEqual([expect.objectContaining({ code: "charter-logo-src-invalid" })]);
  });

  it("refuse une police des titres sans police de secours", () => {
    const font = { family: "Chunk", url: "https://x.example/chunk.woff2", fallback: " " };
    expect(validateMailCharter({ ...SETTINGS, headingFont: font })).toEqual([
      expect.objectContaining({
        code: "charter-font-fallback-invalid",
        field: "headingFont.fallback",
      }),
    ]);
  });

  it("refuse un nom de police qui sortirait de l'attribut style", () => {
    const font = { family: 'Chunk";x', url: "http://x.example/chunk.woff2", fallback: "serif" };
    const codes = validateMailCharter({ ...SETTINGS, headingFont: font }).map((v) => v.code);
    expect(codes).toEqual(["charter-font-url-invalid", "charter-font-family-invalid"]);
  });
});

describe("validateMailCharterForPublication", () => {
  it("accepte la charte d'aujourd'hui", () => {
    expect(validateMailCharterForPublication(SETTINGS, ["fr"])).toEqual([]);
  });

  it("refuse un texte trop pâle sur la carte, avec le rapport mesuré", () => {
    const violations = validateMailCharterForPublication(
      { ...SETTINGS, colors: { ...SETTINGS.colors, mutedText: "#aaaaaa" } },
      ["fr"],
    );
    expect(violations).toEqual([
      expect.objectContaining({ code: "charter-contrast-too-low", field: "colors.mutedText" }),
    ]);
    expect(violations[0]?.message).toContain("2,32:1");
  });

  it("refuse une couleur principale trop claire sous le texte blanc des boutons", () => {
    const fields = validateMailCharterForPublication(
      { ...SETTINGS, colors: { ...SETTINGS.colors, primary: "#9db4e6" } },
      ["fr"],
    ).map((v) => v.field);
    expect(fields).toEqual(["colors.primary", "colors.primary"]);
  });

  it("vérifie aussi la variante sombre", () => {
    const violations = validateMailCharterForPublication(
      { ...SETTINGS, darkColors: { ...SETTINGS.darkColors, text: "#1a2233" } },
      ["fr"],
    );
    expect(violations.map((v) => v.field)).toEqual(["darkColors.text", "darkColors.text"]);
  });

  it("exige le texte de remplacement du logo dans chaque langue de l'espace", () => {
    const violations = validateMailCharterForPublication(SETTINGS, ["fr", "en", "it"]);
    expect(violations.map((v) => v.field)).toEqual(["logo.alt.en", "logo.alt.it"]);
  });

  it("refuse un logo pas encore choisi, mais pas le logo d'origine", () => {
    expect(
      validateMailCharterForPublication({ ...SETTINGS, logo: { src: "", alt: {} } }, ["fr"]),
    ).toEqual([expect.objectContaining({ code: "charter-logo-src-missing" })]);
    expect(validateMailCharterForPublication({ ...SETTINGS, logo: null }, ["fr"])).toEqual([]);
  });
});
