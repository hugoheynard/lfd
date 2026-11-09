import type { MailBlock, MailDocument } from "@lfd/mail-blocks";

import { renderLayout } from "../html.js";
import type { LayoutInput, LayoutUnsubscribe } from "../layout-input.js";
import { renderLayoutText } from "../layout-text.js";
import { renderMailDocumentText } from "../document-text.js";
import { renderMailDocument, type MailDocumentRenderOptions } from "../render-document.js";

/**
 * Le pied de désinscription d'un e-mail marketing (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, B2) : injecté
 * au rendu, APRÈS tout le document, en HTML et en texte — et absent, le rendu
 * d'avant à l'octet.
 */

const URL = "https://shop.lfc.test/api/lfd/mail/unsubscribe/tok.en";

const FOOTER: LayoutUnsubscribe = {
  before: "Vous recevez nos nouvelles parce que vous l'avez accepté. Pour ne plus les recevoir : ",
  label: "se désinscrire",
  url: URL,
  after: ".",
};

const INPUT: LayoutInput = {
  title: "Nos nouveautés",
  body: "Le pain de saison est arrivé.",
  footer: "Pied du modèle",
  supportEmail: "admin@lfc.test",
};

const OPTIONS: MailDocumentRenderOptions = {
  charter: "lfc",
  locale: "fr",
  declaredSections: ["title", "body", "footer"],
};

const FREE: MailBlock = {
  id: "free:1",
  kind: "paragraph",
  text: { fr: "Un paragraphe libre, en dernier." },
};

function documentOf(...blocks: readonly MailBlock[]): MailDocument {
  return { template: "customer.test", blocks };
}

describe("le pied de désinscription (B2)", () => {
  it("absent, le rendu est celui d'avant, à l'octet", () => {
    const withUndefined: LayoutInput = { ...INPUT };
    expect(renderLayout(withUndefined)).toBe(renderLayout(INPUT));
    expect(renderLayout(INPUT)).not.toContain("data-mail-unsubscribe");
    expect(renderLayoutText(INPUT)).not.toContain("désinscrire");
  });

  it("pose le lien en HTML, sous le corps et au-dessus du recours", () => {
    const html = renderLayout({ ...INPUT, unsubscribe: FOOTER });

    expect(html).toContain(`<a href="${URL}"`);
    expect(html).toContain(">se désinscrire</a>.");
    const footerAt = html.indexOf("Pied du modèle");
    const unsubscribeAt = html.indexOf("data-mail-unsubscribe");
    const supportAt = html.indexOf("admin@lfc.test");
    expect(footerAt).toBeLessThan(unsubscribeAt);
    expect(unsubscribeAt).toBeLessThan(supportAt);
  });

  it("échappe la phrase : une balise venue du texte ne passe pas", () => {
    const html = renderLayout({ ...INPUT, unsubscribe: { ...FOOTER, before: "<b>offres</b> " } });

    expect(html).toContain("&lt;b&gt;offres&lt;/b&gt;");
  });

  it("écrit l'adresse en clair dans la version texte, après le corps", () => {
    const text = renderLayoutText({ ...INPUT, unsubscribe: FOOTER });

    expect(text).toContain(URL);
    expect(text.indexOf("Pied du modèle")).toBeLessThan(text.indexOf(URL));
    expect(text.indexOf(URL)).toBeLessThan(text.indexOf("admin@lfc.test"));
  });

  it("suit un document réarrangé, après son dernier bloc libre — HTML et texte", () => {
    const document = documentOf(
      { id: "model:title", kind: "model", section: "title" },
      { id: "model:body", kind: "model", section: "body" },
      FREE,
    );
    const input = { ...INPUT, unsubscribe: FOOTER };

    const html = renderMailDocument(input, document, OPTIONS);
    const text = renderMailDocumentText(input, document, OPTIONS);

    expect(html.indexOf("Un paragraphe libre")).toBeLessThan(html.indexOf(URL));
    expect(text.indexOf("Un paragraphe libre")).toBeLessThan(text.indexOf(URL));
  });

  it("un lien d'un schéma inattendu laisse la phrase, sans lien", () => {
    const html = renderLayout({
      ...INPUT,
      unsubscribe: { ...FOOTER, url: "javascript:alert(1)" },
    });

    expect(html).not.toContain("javascript:");
    expect(html).toContain("se désinscrire.");
  });
});
