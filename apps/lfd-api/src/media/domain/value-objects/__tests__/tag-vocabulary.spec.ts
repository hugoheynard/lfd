import {
  MediaTagNotFoundError,
  MediaTagRequiredError,
  MediaTagUnchangedError,
  removeTag,
  renameTag,
  tagVocabulary,
  targetTag,
} from "../tag-vocabulary.js";

const A = { url: "https://media.example/a.png", tags: ["croissant", "beurre"] };
const B = { url: "https://media.example/b.png", tags: ["doré", "croissant"] };
const C = { url: "https://media.example/c.png", tags: ["baguette"] };

describe("tagVocabulary", () => {
  it("compte par image, du plus porté au moins porté, puis par ordre alphabétique", () => {
    expect(tagVocabulary([A.tags, B.tags, C.tags])).toEqual([
      { tag: "croissant", count: 2 },
      { tag: "baguette", count: 1 },
      { tag: "beurre", count: 1 },
      { tag: "doré", count: 1 },
    ]);
  });

  it("ne compte une image qu'une fois par mot, même portée deux fois", () => {
    expect(tagVocabulary([["baguette", "baguette"]])).toEqual([{ tag: "baguette", count: 1 }]);
  });
});

describe("renameTag", () => {
  it("normalise le nouveau mot comme à l'écriture d'une image", () => {
    const rename = renameTag([A], "croissant", "  Doré ");

    expect(rename).toEqual({
      from: "croissant",
      to: "doré",
      images: [{ url: A.url, tags: ["doré", "beurre"] }],
      merged: false,
    });
  });

  it("fusionne sans doublon, en gardant la première place", () => {
    const rename = renameTag([A, B], "croissant", "doré");

    expect(rename.merged).toBe(true);
    expect(rename.images).toEqual([
      { url: A.url, tags: ["doré", "beurre"] },
      { url: B.url, tags: ["doré"] },
    ]);
  });

  it("ignore une image qui ne porte pas le mot", () => {
    expect(renameTag([A, C], "croissant", "x").images.map((image) => image.url)).toEqual([A.url]);
  });

  it("refuse un nouveau mot vide une fois normalisé", () => {
    expect(() => renameTag([A], "croissant", "   ")).toThrow(MediaTagRequiredError);
  });

  it("refuse un nouveau mot identique une fois en minuscules", () => {
    expect(() => renameTag([A], "croissant", " CROISSANT")).toThrow(MediaTagUnchangedError);
  });

  it("refuse les mots AVANT de dire que personne ne porte l'ancien", () => {
    // Un 400 sur la saisie dit quoi corriger ; un 404 ferait recharger pour rien.
    expect(() => renameTag([], "croissant", "")).toThrow(MediaTagRequiredError);
  });

  it("dit qu'aucune image ne porte le mot", () => {
    expect(() => renameTag([C], "croissant", "x")).toThrow(MediaTagNotFoundError);
  });
});

describe("removeTag", () => {
  it("retire le mot des seules images qui le portent", () => {
    expect(removeTag([A, B, C], "Croissant")).toEqual({
      tag: "croissant",
      images: [
        { url: A.url, tags: ["beurre"] },
        { url: B.url, tags: ["doré"] },
      ],
    });
  });

  it("dit qu'aucune image ne porte le mot", () => {
    expect(() => removeTag([C], "croissant")).toThrow(MediaTagNotFoundError);
  });
});

describe("targetTag", () => {
  it("normalise le mot visé, et refuse un mot vide", () => {
    expect(targetTag(" Baguette ")).toBe("baguette");
    expect(() => targetTag(" ")).toThrow(MediaTagRequiredError);
  });
});
