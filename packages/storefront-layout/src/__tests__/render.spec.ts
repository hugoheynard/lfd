import { isContentRenderable, isRenderable, type RenderableContent } from "../render.js";

const served: ReadonlySet<string> = new Set(["CRO"]);

const croissant: RenderableContent = { kind: "product", sku: "CRO" };
const withdrawn: RenderableContent = { kind: "product", sku: "OLD" };
const easter: RenderableContent = {
  kind: "info",
  title: { fr: "Pâques" },
  image: { url: "https://cdn.example/paques.jpg" },
};

describe("un contenu s'affiche-t-il ?", () => {
  it("un article encore servi, oui ; un article retiré, non", () => {
    expect(isContentRenderable(croissant, served)).toBe(true);
    expect(isContentRenderable(withdrawn, served)).toBe(false);
  });

  it("une info complète, oui", () => {
    expect(isContentRenderable(easter, served)).toBe(true);
  });

  it("une info sans titre en français, non — même traduite ailleurs", () => {
    expect(isContentRenderable({ ...easter, title: { fr: "  " } }, served)).toBe(false);
  });

  it("une info sans image, non", () => {
    expect(isContentRenderable({ ...easter, image: null }, served)).toBe(false);
    expect(isContentRenderable({ ...easter, image: { url: " " } }, served)).toBe(false);
  });
});

describe("un objet montre-t-il quelque chose ?", () => {
  /**
   * « Dans le doute, pas d'info = articles » : un objet vide rend ses cases.
   * `some()` sur une liste vide est faux — c'est ce qu'on veut ici, et ce
   * test le fige.
   */
  it("sans aucun contenu, non : ses cases reviennent au rayon", () => {
    expect(isRenderable({ contents: [] }, served)).toBe(false);
  });

  it("dès qu'un de ses contenus s'affiche, oui", () => {
    expect(isRenderable({ contents: [withdrawn, croissant] }, served)).toBe(true);
  });

  it("si aucun ne s'affiche, non", () => {
    expect(isRenderable({ contents: [withdrawn, { ...easter, image: null }] }, served)).toBe(false);
  });
});
