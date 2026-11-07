import { markText } from "../mail-text-markers.js";
import {
  markVariable,
  revealEditorMarkers,
  stripEditorMarkers,
  type EditorMarkerContext,
} from "../mail-editor-markers.js";

const CONTEXT: EditorMarkerContext = {
  mail: "customer.order-ready",
  variants: new Map<string, string | null>([
    ["title.paid", "Commande payée"],
    ["qrAlt", null],
    ["cta", null],
  ]),
};

describe("les marqueurs de l'aperçu de l'éditeur (S5f)", () => {
  it("une phrase devient data-phrase + data-variant, une variable data-var", () => {
    const text = markText(
      "customer.order-ready",
      "title.paid",
      `Commande ${markVariable("orderNumber", "EX-1")} payée`,
    );
    expect(revealEditorMarkers(`<h1>${text}</h1>`, CONTEXT)).toBe(
      '<h1><span data-phrase="title.paid" data-variant="Commande payée">Commande <span data-var="orderNumber">EX-1</span> payée</span></h1>',
    );
  });

  it("sans variante, pas d'attribut data-variant", () => {
    const html = `<p>${markText("customer.order-ready", "cta", "Voir")}</p>`;
    expect(revealEditorMarkers(html, CONTEXT)).toBe('<p><span data-phrase="cta">Voir</span></p>');
  });

  it("dans une balise (texte de repli d'une image), les repères disparaissent", () => {
    const alt = markText("customer.order-ready", "qrAlt", `Code ${markVariable("code", "AB")}`);
    expect(revealEditorMarkers(`<img alt="${alt}" />`, CONTEXT)).toBe('<img alt="Code AB" />');
  });

  it("une phrase d'un autre e-mail n'est pas marquée, ses variables le restent", () => {
    const text = markText(
      "customer.order-placed",
      "title",
      `Hé ${markVariable("firstName", "Lu")}`,
    );
    expect(revealEditorMarkers(`<p>${text}</p>`, CONTEXT)).toBe(
      '<p>Hé <span data-var="firstName">Lu</span></p>',
    );
  });

  it("une phrase de l'e-mail que l'éditeur n'écrit pas (§ 23) n'est pas marquée, ni ses variables", () => {
    const text = markText(
      "customer.order-ready",
      "piecesLabel",
      `${markVariable("count", "12")} pièces`,
    );
    expect(revealEditorMarkers(`<td>${text}</td>`, CONTEXT)).toBe("<td>12 pièces</td>");
  });

  it("une variable qui suit une phrase non marquée retrouve son repère", () => {
    const silent = markText("customer.order-ready", "piecesLabel", "Contenu");
    const shown = markText("customer.order-ready", "cta", `Voir ${markVariable("ref", "R")}`);
    expect(revealEditorMarkers(`<p>${silent}${shown}</p>`, CONTEXT)).toBe(
      '<p>Contenu<span data-phrase="cta">Voir <span data-var="ref">R</span></span></p>',
    );
  });

  it("les noms et chemins sont échappés dans l'attribut", () => {
    const context: EditorMarkerContext = {
      mail: "m",
      variants: new Map([['a"b', 'x"<y']]),
    };
    expect(revealEditorMarkers(markText("m", 'a"b', "t"), context)).toBe(
      '<span data-phrase="a&quot;b" data-variant="x&quot;&lt;y">t</span>',
    );
  });

  it("ôter les repères rend le texte nu", () => {
    const text = markText("m", "p", `A ${markVariable("v", "B")} C`);
    expect(stripEditorMarkers(text)).toBe("A B C");
  });
});
