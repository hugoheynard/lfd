import { renderLayout, type LayoutInput } from "../html.js";
import { effectiveSectionOrder, LAYOUT_SECTIONS } from "../layout-sections.js";

const FULL: LayoutInput = {
  title: "Titre",
  body: "Corps",
  rows: [{ label: "Total", value: "10 €", strong: true }],
  image: { contentId: "qr", alt: "QR", sizePx: 120 },
  cta: { label: "Voir", url: "https://lfc.test/c" },
  secondaryLink: { label: "Gérer", url: "https://lfc.test/g" },
  footer: "Pied",
  supportEmail: "admin@lfc.test",
  brand: "Enseigne",
};

describe("les sections du corps (plan textes des e-mails, E4)", () => {
  it("l'ordre demandé explicitement égal au défaut rend les mêmes octets que sans ordre", () => {
    expect(renderLayout({ ...FULL, sections: LAYOUT_SECTIONS })).toBe(renderLayout(FULL));
  });

  it("un ordre partiel garde toutes les sections : les absentes suivent dans l'ordre par défaut", () => {
    expect(effectiveSectionOrder(["footer", "nope", "footer", "title"])).toEqual([
      "footer",
      "title",
      "body",
      "summary",
      "image",
      "itinerary",
      "cta",
      "secondaryLink",
    ]);
  });

  it("place les sections dans l'ordre demandé, l'en-tête en tête et le recours en bas", () => {
    const html = renderLayout({ ...FULL, sections: ["footer", "cta", "title"] });
    const at = (text: string): number => html.indexOf(text);
    expect(at("Enseigne")).toBeLessThan(at("Pied"));
    expect(at("Pied")).toBeLessThan(at("Voir"));
    expect(at("Voir")).toBeLessThan(at("Titre"));
    expect(at("Titre")).toBeLessThan(at("Corps"));
    expect(at("Gérer")).toBeLessThan(at("admin@lfc.test"));
  });

  it("le lien secondaire reste muet sans bouton, quel que soit l'ordre", () => {
    const html = renderLayout({
      title: "T",
      body: "b",
      secondaryLink: { label: "Gérer", url: "https://lfc.test/g" },
      sections: ["secondaryLink", "title"],
    });
    expect(html).not.toContain("Gérer");
  });

  it("ne pose les repères de section que sur demande, et seulement autour d'une section rendue", () => {
    expect(renderLayout(FULL)).not.toContain("data-mail-section");
    const marked = renderLayout({ ...FULL, markSections: true });
    expect(marked).toContain('<div data-mail-section="title"><h1');
    expect(marked).toContain('data-mail-section="summary"');
    expect(marked).not.toContain('data-mail-section="itinerary"');
  });

  it("rend l'itinéraire échappé, après l'image, et jamais sur un schéma hostile", () => {
    const html = renderLayout({
      ...FULL,
      itinerary: { label: "Y aller", url: "https://www.google.com/maps/dir/?api=1&destination=a" },
    });
    expect(html).toContain("api=1&amp;destination=a");
    expect(html.indexOf("cid:qr")).toBeLessThan(html.indexOf("Y aller"));
    expect(html.indexOf("Y aller")).toBeLessThan(html.indexOf("Voir"));
    const hostile = renderLayout({
      ...FULL,
      itinerary: { label: "Piège", url: "javascript:alert(1)" },
    });
    expect(hostile).not.toContain("Piège");
    expect(hostile).toBe(renderLayout(FULL));
  });
});
