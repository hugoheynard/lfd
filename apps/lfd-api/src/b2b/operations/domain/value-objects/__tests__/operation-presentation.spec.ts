import {
  InvalidOperationAudienceError,
  InvalidOperationFocalError,
  InvalidOperationImageError,
  InvalidOperationTextError,
} from "../../errors/operation-errors.js";
import { operationAudience } from "../operation-audience.js";
import { operationImage } from "../operation-image.js";
import { operationText } from "../operation-text.js";

describe("operationText", () => {
  it("rogne, et fait disparaître une traduction vide plutôt que de l'afficher en blanc", () => {
    expect(operationText("nom", { fr: " Noël ", en: "  ", it: " Natale " })).toEqual({
      fr: "Noël",
      it: "Natale",
    });
  });

  it("refuse un français vide, en nommant le champ", () => {
    expect(() => operationText("nom de l'opération", { fr: "   ", en: "Christmas" })).toThrow(
      InvalidOperationTextError,
    );
    expect(() => operationText("nom de l'opération", { fr: "" })).toThrow(/nom de l'opération/u);
  });
});

describe("operationImage", () => {
  it("rogne l'adresse et le texte alternatif, qui peut être vide", () => {
    expect(operationImage({ url: " https://media.test/buche.webp ", alt: "  " })).toEqual({
      url: "https://media.test/buche.webp",
      alt: "",
      focal: null,
    });
    expect(operationImage(null)).toBeNull();
  });

  it("garde le point focal de la médiathèque, bornes comprises", () => {
    expect(
      operationImage({ url: "https://media.test/a.webp", alt: "", focal: { x: 0, y: 1 } })?.focal,
    ).toEqual({ x: 0, y: 1 });
  });

  it.each([
    { x: -0.1, y: 0.5 },
    { x: 0.5, y: 1.01 },
    { x: Number.NaN, y: 0.5 },
  ])("refuse un point focal hors de l'image (%o)", (focal) => {
    expect(() => operationImage({ url: "https://media.test/a.webp", alt: "", focal })).toThrow(
      InvalidOperationFocalError,
    );
  });

  it("refuse une image sans adresse", () => {
    expect(() => operationImage({ url: "  ", alt: "Une bûche" })).toThrow(
      InvalidOperationImageError,
    );
  });
});

describe("operationAudience", () => {
  it.each(["pro", "public", "both"])("accepte « %s »", (audience) => {
    expect(operationAudience(audience)).toBe(audience);
  });

  it("refuse toute autre clientèle — une ligne relue de travers aussi", () => {
    expect(() => operationAudience("tous")).toThrow(InvalidOperationAudienceError);
    expect(() => operationAudience("none")).toThrow(InvalidOperationAudienceError);
  });
});
