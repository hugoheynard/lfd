import { DomainError } from "../../../../../../platform/shared/errors/app-error.js";
import { type PhotoCardContentRules, readPhotoCardContent } from "../photo-card-content.js";

/**
 * **Le contenu d'une carte** : titre obligatoire, deux longueurs en paramètre,
 * et les refus dans les mots de l'usage.
 */

class ContentError extends DomainError {
  constructor(reason: string) {
    super("test.content", reason);
  }
}

const RULES: PhotoCardContentRules = {
  titleMax: 5,
  bodyMax: 8,
  refusals: {
    emptyTitle: () => new ContentError("titre vide"),
    titleTooLong: (length, max) => new ContentError(`titre ${length}/${max}`),
    bodyTooLong: (length, max) => new ContentError(`texte ${length}/${max}`),
  },
};

describe("readPhotoCardContent", () => {
  it("nettoie les espaces de bord et accepte les bornes exactes", () => {
    expect(readPhotoCardContent({ title: "  12345 ", body: " 12345678 " }, RULES)).toEqual({
      title: "12345",
      body: "12345678",
    });
  });

  it("accepte un texte vide", () => {
    expect(readPhotoCardContent({ title: "Note", body: "   " }, RULES)).toEqual({
      title: "Note",
      body: "",
    });
  });

  it.each([
    ["un titre vide", { title: "   ", body: "" }, "titre vide"],
    ["un titre trop long, mesuré après nettoyage", { title: " 123456 ", body: "" }, "titre 6/5"],
    ["un texte trop long", { title: "Note", body: "123456789" }, "texte 9/8"],
  ])("refuse %s avec la fabrique de l'usage", (_, input, message) => {
    expect(() => readPhotoCardContent(input, RULES)).toThrow(ContentError);
    expect(() => readPhotoCardContent(input, RULES)).toThrow(message);
  });

  it("dit le titre vide avant tout, même quand le texte déborde aussi", () => {
    expect(() => readPhotoCardContent({ title: "", body: "123456789" }, RULES)).toThrow(
      "titre vide",
    );
  });
});
