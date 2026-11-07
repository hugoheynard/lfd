import type { MailCharterSettings, MailDocument } from "@lfd/mail-blocks";

import { renderLayout, type LayoutInput } from "../html.js";
import { BRAND, BUTTON_STYLE, TITLE_STYLE } from "../layout-styles.js";
import {
  renderCharterOf,
  STARTING_MAIL_CHARTER,
  startingMailCharterSettings,
} from "../render-charter.js";
import { renderMailDocument } from "../render-document.js";

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
    border: "#ded6c8",
  },
  darkColors: { page: "#101010", card: "#1c1c1c", text: "#f0f0f0", border: "#333333" },
  headingFont: {
    family: "Fraunces",
    url: "https://fonts.lfd.test/fraunces.woff2",
    fallback: "Georgia, serif",
  },
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
