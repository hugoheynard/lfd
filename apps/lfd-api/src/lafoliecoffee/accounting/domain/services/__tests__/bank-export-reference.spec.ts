import { bankExportReferenceOf, exportPartOf } from "../bank-export-reference.js";

const MAX = 200;

describe("le numéro court d'un export bancaire", () => {
  it("compose EXC-<n> et EXM-<n>", () => {
    expect(bankExportReferenceOf("EXC", 12)).toBe("EXC-12");
    expect(bankExportReferenceOf("EXM", 4)).toBe("EXM-4");
  });
});

describe("le rang d'un fichier dans sa série — k sur N", () => {
  it("une file qui tient en un fichier : 1 sur 1", () => {
    expect(exportPartOf(null, 12, MAX)).toEqual({ rank: 1, count: 1 });
    expect(exportPartOf(null, MAX, MAX)).toEqual({ rank: 1, count: 1 });
  });

  it("237 à exporter : 1 sur 2, puis les 37 restants : 2 sur 2", () => {
    const first = exportPartOf(null, 237, MAX);
    expect(first).toEqual({ rank: 1, count: 2 });
    expect(exportPartOf({ part: first }, 37, MAX)).toEqual({ rank: 2, count: 2 });
  });

  it("une série terminée recommence à 1", () => {
    expect(exportPartOf({ part: { rank: 2, count: 2 } }, 5, MAX)).toEqual({ rank: 1, count: 1 });
  });

  it("un export d'avant la numérotation ne fait pas de série", () => {
    expect(exportPartOf({ part: null }, 5, MAX)).toEqual({ rank: 1, count: 1 });
  });

  it("des lignes arrivées entre deux fichiers allongent la série", () => {
    expect(exportPartOf({ part: { rank: 1, count: 2 } }, 401, MAX)).toEqual({
      rank: 2,
      count: 4,
    });
  });

  it("une file vidée entre-temps garde au moins le fichier qu'on prépare", () => {
    expect(exportPartOf({ part: { rank: 1, count: 3 } }, 0, MAX)).toEqual({ rank: 2, count: 2 });
  });
});
