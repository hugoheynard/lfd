import { LibraryTooLargeToRankError, MAX_RANKED_IMAGES, rankLibrary } from "../rank-library.js";
import { compareImages, type RankedImage } from "../../value-objects/library-order.js";

/** Des instants comparés ENTRE EUX seulement : rien ici ne lit l'horloge. */
const EARLY = new Date("2026-01-01T08:00:00.000Z");
const LATE = new Date("2026-01-02T08:00:00.000Z");

function image(url: string, over: Partial<RankedImage> = {}): RankedImage {
  return { url, name: "", depositedAt: EARLY, uses: 0, shotOn: null, ...over };
}

const urls = (images: readonly RankedImage[]): string[] => images.map((one) => one.url);

describe("les ordres du fonds", () => {
  it("met le dépôt le plus récent d'abord, l'URL départageant", () => {
    const fonds = [image("b"), image("c", { depositedAt: LATE }), image("a")];

    expect(urls([...fonds].sort((x, y) => compareImages("deposited", x, y)))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("classe par prise de vue, la plus récente d'abord, les images sans date EN DERNIER", () => {
    const fonds = [
      image("z"),
      image("y", { shotOn: "2026-03-01" }),
      image("x", { shotOn: "2026-05-01" }),
      image("w", { shotOn: "2026-03-01" }),
    ];

    expect(urls([...fonds].sort((x, y) => compareImages("shot", x, y)))).toEqual([
      "x",
      "w",
      "y",
      "z",
    ]);
  });

  it("classe par étiquette, et les images sans étiquette EN DERNIER", () => {
    const fonds = [image("z"), image("y", { name: "pain" }), image("x", { name: "brioche" })];

    expect(urls([...fonds].sort((x, y) => compareImages("name", x, y)))).toEqual(["x", "y", "z"]);
  });

  it("met la plus employée d'abord", () => {
    const fonds = [image("a", { uses: 1 }), image("b", { uses: 4 }), image("c")];

    expect(urls([...fonds].sort((x, y) => compareImages("uses", x, y)))).toEqual(["b", "a", "c"]);
  });
});

describe("rankLibrary — le classement en mémoire", () => {
  const fonds = [
    image("a", { uses: 2 }),
    image("b", { uses: 0 }),
    image("c", { uses: 5 }),
    image("d", { uses: 0 }),
  ];

  it("découpe par position, sans doublon ni saut d'une page à l'autre", () => {
    const first = rankLibrary(fonds, { sort: "uses", limit: 2, offset: 0 });
    expect(urls(first.images)).toEqual(["c", "a"]);
    expect(first.next).toEqual({ sort: "uses", key: 2, url: "a" });

    const second = rankLibrary(fonds, {
      sort: "uses",
      limit: 2,
      offset: 0,
      after: first.next ?? undefined,
    });
    expect(urls(second.images)).toEqual(["b", "d"]);
    expect(second.next).toBeNull();
    expect(second.total).toBe(4);
  });

  it("tient la page suivante quand une image arrive entre deux lectures", () => {
    // Un rang se décale ; une position non. L'arrivée, sans emploi, se range
    // à sa place et n'est ni rendue deux fois ni cause d'un saut.
    const first = rankLibrary(fonds, { sort: "uses", limit: 2, offset: 0 });
    const grown = [...fonds, image("0", { uses: 9 }), image("bb", { uses: 0 })];

    const second = rankLibrary(grown, {
      sort: "uses",
      limit: 5,
      offset: 0,
      after: first.next ?? undefined,
    });

    expect(urls(second.images)).toEqual(["b", "bb", "d"]);
  });

  it("ne garde que les inutilisées, et compte le total APRÈS ce filtre", () => {
    const page = rankLibrary(fonds, { sort: "uses", limit: 10, offset: 0, unused: true });

    expect(urls(page.images)).toEqual(["b", "d"]);
    expect(page.total).toBe(2);
  });

  it("sert encore l'ancien décalage quand aucune position n'est donnée", () => {
    expect(urls(rankLibrary(fonds, { sort: "uses", limit: 1, offset: 1 }).images)).toEqual(["a"]);
  });

  it("refuse de classer au-delà de la borne plutôt que de saturer", () => {
    const many = Array.from({ length: MAX_RANKED_IMAGES + 1 }, (_, i) => image(`u${i}`));

    expect(() => rankLibrary(many, { sort: "uses", limit: 10, offset: 0 })).toThrow(
      LibraryTooLargeToRankError,
    );
  });
});
