import { cropRectangle } from "../value-objects/mail-image-crop.js";

describe("cropRectangle — le rectangle gardé autour du point focal", () => {
  it("garde toute la hauteur d'une image plus large que le format, centrée par défaut", () => {
    expect(cropRectangle(4000, 1000, { format: "1:1", focal: { x: 0.5, y: 0.5 } })).toEqual({
      left: 1500,
      top: 0,
      width: 1000,
      height: 1000,
    });
  });

  it("garde toute la largeur d'une image plus haute que le format", () => {
    expect(cropRectangle(1200, 1200, { format: "2:1", focal: { x: 0.5, y: 0.25 } })).toEqual({
      left: 0,
      top: 0,
      width: 1200,
      height: 600,
    });
  });

  it("glisse vers l'intérieur plutôt que de sortir de l'image", () => {
    expect(cropRectangle(3000, 1000, { format: "3:2", focal: { x: 1, y: 0 } })).toEqual({
      left: 1500,
      top: 0,
      width: 1500,
      height: 1000,
    });
    expect(cropRectangle(3000, 1000, { format: "3:2", focal: { x: 0, y: 1 } })).toMatchObject({
      left: 0,
      top: 0,
    });
  });

  it("une image déjà au format est gardée entière", () => {
    expect(cropRectangle(900, 600, { format: "3:2", focal: { x: 0.9, y: 0.1 } })).toEqual({
      left: 0,
      top: 0,
      width: 900,
      height: 600,
    });
  });

  it("une image d'un pixel reste d'un pixel", () => {
    expect(cropRectangle(1, 1, { format: "2:1", focal: { x: 0.5, y: 0.5 } })).toEqual({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
  });
});
