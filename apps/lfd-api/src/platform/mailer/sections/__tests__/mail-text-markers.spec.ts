import { markedCopy, markText, revealTextMarkers, stripTextMarkers } from "../mail-text-markers.js";

describe("les repères de texte de l'aperçu (E4, S4)", () => {
  it("balise un texte dans le corps, et l'efface dans un attribut", () => {
    const text = markText("customer.order-ready", "qrAlt", "Code &amp; retrait");
    const html = `<p>${markText("customer.order-ready", "title", "C'est prêt.")}</p><img alt="${text}" />`;
    expect(revealTextMarkers(html)).toBe(
      `<p><span data-mail-text="title" data-mail-text-of="customer.order-ready">C'est prêt.</span></p><img alt="Code &amp; retrait" />`,
    );
  });

  it("ôte tous les repères d'un objet, y compris imbriqués", () => {
    const inner = markText("m", "b", "{x}");
    expect(stripTextMarkers(markText("m", "a", `Votre ${inner} prêt`))).toBe("Votre {x} prêt");
  });

  it("marque chaque texte d'un dictionnaire par son e-mail et son chemin, sans toucher l'original", () => {
    const copy = { "customer.x": { title: { paid: "Payé" }, cta: "Voir" } };
    const marked = markedCopy(copy);
    expect(marked["customer.x"].title.paid).toBe(markText("customer.x", "title.paid", "Payé"));
    expect(marked["customer.x"].cta).toBe(markText("customer.x", "cta", "Voir"));
    expect(copy["customer.x"].cta).toBe("Voir");
  });
});
