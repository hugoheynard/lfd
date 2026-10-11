import { paletteStrip, type StripImage } from "../palette-strip.js";

const DAY = 86_400_000;
const ORIGIN = 1_700_000_000_000;

function image(rank: number, palette: StripImage["palette"] = null): StripImage {
  return {
    url: `u${String(rank).padStart(3, "0")}`,
    takenAt: new Date(ORIGIN + rank * DAY),
    palette,
  };
}

const RED = [{ hex: "#ff0000", share: 1, outlier: false }];

describe("paletteStrip — le découpage en colonnes", () => {
  it("ne rend aucune colonne pour un fonds vide", () => {
    expect(paletteStrip([], 120)).toEqual({ columns: [], total: 0, unpainted: 0 });
  });

  it("rend une colonne par image quand il y a moins d'images que de colonnes", () => {
    const strip = paletteStrip([image(0, RED), image(1)], 120);
    expect(strip.columns.map((column) => column.count)).toEqual([1, 1]);
    expect(strip.columns[1]).toMatchObject({ palette: [], sampleUrl: "u001" });
    expect(strip.unpainted).toBe(1);
  });

  it("partage en tranches consécutives de même effectif, à une image près", () => {
    const images = Array.from({ length: 10 }, (_, rank) => image(rank));
    const strip = paletteStrip(images, 3);
    expect(strip.columns.map((column) => column.count)).toEqual([3, 3, 4]);
    expect(strip.columns[1]).toMatchObject({
      from: images[3]?.takenAt,
      to: images[5]?.takenAt,
    });
    expect(strip.total).toBe(10);
  });

  it("découpe par rang et non par durée : un trou de calendrier ne vide aucune colonne", () => {
    const images = [image(0), image(1), image(500), image(501)];
    expect(paletteStrip(images, 2).columns.map((column) => column.count)).toEqual([2, 2]);
  });

  it("prend pour aperçu la première image peinte de la colonne", () => {
    const strip = paletteStrip([image(0), image(1, RED), image(2)], 1);
    expect(strip.columns[0]).toMatchObject({ sampleUrl: "u001", count: 3 });
    expect(strip.columns[0]?.palette[0]?.hex).toBe("#ff0000");
  });
});
