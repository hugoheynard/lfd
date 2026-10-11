import {
  mediaFileName,
  mediaLabel,
  MediaStillInUseError,
  mediaTags,
  TooManyMediaTagsError,
} from "../image.js";

const URL = "https://media.example/products/deadbeef.png";

describe("le nom d'une image dans le journal", () => {
  it("est son étiquette quand elle en a une", () => {
    expect(mediaLabel("Croissant au beurre", URL)).toBe("Croissant au beurre");
  });

  it("est son nom de fichier sinon, jamais l'URL entière", () => {
    expect(mediaLabel("", URL)).toBe("deadbeef.png");
    expect(mediaFileName("products/deadbeef.png")).toBe("deadbeef.png");
  });
});

describe("les mots-clés d'une image", () => {
  it("refuse au-delà de trente mots distincts, comptés après dédoublonnage", () => {
    const thirty = Array.from({ length: 30 }, (_, index) => `mot${String(index)}`);
    expect(mediaTags([...thirty, "MOT0", " mot1 "])).toHaveLength(30);
    expect(() => mediaTags([...thirty, "trente-et-un"])).toThrow(TooManyMediaTagsError);
  });
});

describe("le refus de supprimer une image affichée", () => {
  it("parle d'emplacements, pas de fiches — une famille ou la vitrine affichent aussi", () => {
    expect(new MediaStillInUseError(3).message).toContain("3 emplacements");
    expect(new MediaStillInUseError(3).message).not.toContain("fiches :");
    expect(new MediaStillInUseError(1).code).toBe("media.still_in_use");
  });
});
