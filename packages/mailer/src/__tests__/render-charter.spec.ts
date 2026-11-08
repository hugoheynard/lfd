import type { MailCharterSettings, MailDocument } from "@lfd/mail-blocks";

import { renderLayout, type LayoutInput } from "../html.js";
import { BRAND, BUTTON_STYLE, TEXT_FONT_STACK, TITLE_STYLE } from "../layout-styles.js";
import {
  renderCharterOf,
  STARTING_MAIL_CHARTER,
  startingMailCharterSettings,
} from "../render-charter.js";
import { renderMailDocument } from "../render-document.js";
import { renderMailDocumentParts } from "../render-document-parts.js";

const INPUT: LayoutInput = {
  title: "Titre",
  body: "Corps",
  cta: { label: "Voir", url: "https://lfc.test/c" },
  brand: "Enseigne",
  supportEmail: "aide@lfd.test",
  logo: { contentId: "lfc-logo", alt: "La Folie Coffee", widthPx: 63, heightPx: 56 },
  brandFontUrl: "https://lfc.test/brand/fonts/chunk-400.woff2",
};

const PUBLISHED: MailCharterSettings = {
  logo: {
    src: "https://mail.lfd.test/images/logo.png",
    alt: { fr: "La Folie Douce", en: "La Folie Douce (en)" },
  },
  colors: {
    page: "#f4f1ea",
    card: "#fffefc",
    text: "#1b1b1b",
    mutedText: "#5a5a5a",
    primary: "#7a1f3d",
    band: "#1a3157",
    border: "#ded6c8",
  },
  darkColors: { page: "#101010", card: "#1c1c1c", text: "#f0f0f0", border: "#333333" },
  headingFont: {
    family: "Fraunces",
    url: "https://fonts.lfd.test/fraunces.woff2",
    fallback: "Georgia, serif",
  },
  textFont: null,
  footer: { fr: "La Folie Douce — 1 rue du Four, Lyon" },
};

describe("la charte de départ", () => {
  it("rend exactement ce que la coquille rendait sans charte", () => {
    expect(renderLayout({ ...INPUT, charter: STARTING_MAIL_CHARTER })).toBe(renderLayout(INPUT));
  });

  it("donne aux constantes exportées les valeurs de la marque d'aujourd'hui", () => {
    expect(TITLE_STYLE).toBe(`margin:0 0 16px;font-size:20px;line-height:1.3;color:${BRAND.ink};`);
    expect(BUTTON_STYLE).toContain(`background:${BRAND.navy};`);
  });

  it("se présente à l'écran avec la police de l'enseigne si son adresse est publique", () => {
    expect(startingMailCharterSettings(INPUT.brandFontUrl).headingFont).toEqual({
      family: "Chunk",
      url: INPUT.brandFontUrl,
      fallback: "'Arial Black',Impact,sans-serif",
    });
    expect(startingMailCharterSettings("http://localhost:4200/x.woff2").headingFont).toBeNull();
    expect(startingMailCharterSettings(undefined).logo).toBeNull();
  });
});

describe("la charte de départ publiée sans rien changer", () => {
  /**
   * Régression : le bandeau prenait la couleur principale d'une charte
   * publiée, et publier la charte de départ telle quelle le fonçait d'un cran
   * (`#1a3157` → `#24448f`). Il a sa propre couleur depuis le 2026-11-07.
   */
  it("garde le bandeau d'aujourd'hui", () => {
    const published = renderCharterOf(startingMailCharterSettings(undefined), "fr");
    expect(published.band).toBe(STARTING_MAIL_CHARTER.band);
    expect(published.band).toBe(BRAND.navyDeep);
    const html = renderLayout({ ...INPUT, charter: published });
    expect(html).toContain(`background:${BRAND.navyDeep}`);
  });
});

describe("une charte publiée", () => {
  const html = renderLayout({ ...INPUT, charter: renderCharterOf(PUBLISHED, "fr") });

  it("peint la page, la carte, le texte et le bouton de ses couleurs", () => {
    expect(html).toContain("background:#f4f1ea;");
    expect(html).toContain("background:#fffefc;border:1px solid #ded6c8;");
    expect(html).toContain("background:#7a1f3d;color:#ffffff;");
    expect(html).not.toContain(BRAND.navy);
  });

  it("pose son logo par son adresse, avec le texte de la langue de l'envoi, au lieu du cid", () => {
    expect(html).toContain('src="https://mail.lfd.test/images/logo.png" alt="La Folie Douce"');
    expect(html).not.toContain("cid:lfc-logo");
    const en = renderLayout({ ...INPUT, charter: renderCharterOf(PUBLISHED, "en") });
    expect(en).toContain('alt="La Folie Douce (en)"');
  });

  it("déclare sa police des titres avec son secours, et sa variante sombre", () => {
    expect(html).toContain("@font-face{font-family:'Fraunces'");
    expect(html).toContain("font-family:'Fraunces',Georgia, serif;");
    expect(html).toContain(
      "@media (prefers-color-scheme:dark){.lfd-page{background:#101010!important",
    );
    expect(html).not.toContain("chunk-400.woff2");
  });

  it("ajoute son pied de page commun au-dessus du recours", () => {
    const footer = html.indexOf("La Folie Douce — 1 rue du Four, Lyon");
    expect(footer).toBeGreaterThan(-1);
    expect(footer).toBeLessThan(html.indexOf("aide@lfd.test"));
  });

  it("garde le logo embarqué quand la charte n'en choisit pas", () => {
    const own = renderLayout({
      ...INPUT,
      charter: renderCharterOf({ ...PUBLISHED, logo: null }, "fr"),
    });
    expect(own).toContain("cid:lfc-logo");
  });

  it("s'applique aussi aux blocs libres d'un document réarrangé", () => {
    const document: MailDocument = {
      template: "staff.invited",
      blocks: [
        { id: "m1", kind: "model", section: "title" },
        { id: "b1", kind: "button", label: { fr: "Ouvrir" }, href: "https://lfd.test/o" },
      ],
    };
    const rendered = renderMailDocument(
      { ...INPUT, charter: renderCharterOf(PUBLISHED, "fr") },
      document,
      { charter: "lfd", locale: "fr", declaredSections: ["title", "body"] },
    );
    expect(rendered).toContain(
      'href="https://lfd.test/o" style="display:inline-block;padding:13px 22px;background:#7a1f3d;',
    );
  });
});

/**
 * Le canevas de l'éditeur montre le pied comme l'envoi (§ 25, C1 — d.2) :
 * le fragment de pied portait le seul recours, sans le pied commun de la
 * charte publiée.
 */
describe("le pied du document découpé", () => {
  const document: MailDocument = {
    template: "staff.invited",
    blocks: [{ id: "m1", kind: "model", section: "title" }],
  };
  const options = { charter: "lfd", locale: "fr", declaredSections: ["title", "body"] } as const;

  it("porte le pied commun de la charte publiée, au-dessus du recours", () => {
    const { footer } = renderMailDocumentParts(
      { ...INPUT, charter: renderCharterOf(PUBLISHED, "fr") },
      document,
      options,
    );
    expect(footer).toContain("La Folie Douce — 1 rue du Four, Lyon");
    expect(footer.indexOf("1 rue du Four")).toBeLessThan(footer.indexOf("aide@lfd.test"));
  });

  it("sous la charte de départ, ne porte que le recours", () => {
    const { footer } = renderMailDocumentParts(INPUT, document, options);
    expect(footer).not.toContain("1 rue du Four");
    expect(footer).toContain("aide@lfd.test");
  });
});

describe("la police du texte", () => {
  const POGONIA = {
    family: "Pogonia",
    url: "https://lfc.test/brand/fonts/pogonia-400.woff2",
    fallback: "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  };

  it("n'existe pas dans la charte de départ : la pile système, à l'octet", () => {
    expect(startingMailCharterSettings(INPUT.brandFontUrl).textFont).toBeNull();
    expect(renderLayout(INPUT)).toContain(`font-family:${TEXT_FONT_STACK};`);
  });

  it("absente d'une charte publiée, ne change ni le corps ni le <head>", () => {
    const html = renderLayout({ ...INPUT, charter: renderCharterOf(PUBLISHED, "fr") });
    expect(html).toContain(
      `<body class="lfd-page" style="margin:0;padding:24px;font-family:${TEXT_FONT_STACK};`,
    );
    expect(html).not.toContain("Pogonia");
    expect(html.match(/@font-face/gu)).toHaveLength(1);
  });

  it("déclarée, pose son @font-face et habille le corps, secours écrit en ligne", () => {
    const charter = renderCharterOf({ ...PUBLISHED, textFont: POGONIA }, "fr");
    const html = renderLayout({ ...INPUT, charter });
    expect(html).toContain(
      "@font-face{font-family:'Pogonia';font-style:normal;font-weight:400;src:url('https://lfc.test/brand/fonts/pogonia-400.woff2') format('woff2');}",
    );
    expect(html).toContain(
      "font-family:'Pogonia',-apple-system, 'Segoe UI', Roboto, Arial, sans-serif;color:#1b1b1b;",
    );
    expect(html).toContain("@font-face{font-family:'Fraunces'");
  });

  it("habille aussi l'enseigne quand la charte n'a pas de police des titres", () => {
    const charter = renderCharterOf({ ...PUBLISHED, headingFont: null, textFont: POGONIA }, "fr");
    const html = renderLayout({ ...INPUT, charter });
    expect(html).toContain("color:#ffffff;font-family:'Pogonia',-apple-system");
  });

  it("habille un document réarrangé de la même façon", () => {
    const document: MailDocument = {
      template: "staff.invited",
      blocks: [
        { id: "m1", kind: "model", section: "title" },
        { id: "b1", kind: "button", label: { fr: "Ouvrir" }, href: "https://lfd.test/o" },
      ],
    };
    const html = renderMailDocument(
      { ...INPUT, charter: renderCharterOf({ ...PUBLISHED, textFont: POGONIA }, "fr") },
      document,
      { charter: "lfd", locale: "fr", declaredSections: ["title", "body"] },
    );
    expect(html).toContain("@font-face{font-family:'Pogonia'");
    expect(html).toContain("font-family:'Pogonia',-apple-system");
  });

  it("déclare un @font-face par graisse, la même famille", () => {
    const weighted = {
      ...POGONIA,
      weights: {
        "600": "https://lfc.test/brand/fonts/pogonia-600.woff2",
        "700": "https://lfc.test/brand/fonts/pogonia-700.woff2",
      },
    };
    const html = renderLayout({
      ...INPUT,
      charter: renderCharterOf({ ...PUBLISHED, textFont: weighted }, "fr"),
    });
    for (const [weight, file] of [
      ["400", "pogonia-400"],
      ["600", "pogonia-600"],
      ["700", "pogonia-700"],
    ]) {
      expect(html).toContain(
        `@font-face{font-family:'Pogonia';font-style:normal;font-weight:${weight};src:url('https://lfc.test/brand/fonts/${file}.woff2')`,
      );
    }
  });

  it("une police à une graisse déclare 600 et 700 vers son seul fichier : pas de faux gras", () => {
    const chunk = "https://lfc.test/brand/fonts/chunk-400.woff2";
    const headingFont = {
      family: "Chunk",
      url: chunk,
      fallback: "'Arial Black', Impact, sans-serif",
      weights: { "600": chunk, "700": chunk },
    };
    const html = renderLayout({
      ...INPUT,
      charter: renderCharterOf({ ...PUBLISHED, headingFont }, "fr"),
    });
    expect(html.match(/@font-face\{font-family:'Chunk'/gu)).toHaveLength(3);
    expect(html).toContain(`font-weight:700;src:url('${chunk}')`);
  });

  it("une police rangée sans graisses ne déclare que la 400, comme avant", () => {
    const html = renderLayout({ ...INPUT, charter: renderCharterOf(PUBLISHED, "fr") });
    expect(html.match(/@font-face\{font-family:'Fraunces'/gu)).toHaveLength(1);
  });
});
