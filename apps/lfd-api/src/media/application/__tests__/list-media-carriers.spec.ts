import { ListMediaCarriersHandler, ListMediaCarriersQuery } from "../list-media-carriers.js";
import { MediaCarriers, type Carrier } from "../../channels/carriers/media-carriers.js";

/** Des porteurs qui répondent ce qu'on leur a mis, et retiennent la question. */
class FakeCarriers extends MediaCarriers {
  asked: string | null = null;

  constructor(private readonly byUrl: ReadonlyMap<string, readonly Carrier[]> = new Map()) {
    super();
  }

  usesOf(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(new Map());
  }

  carriersOf(url: string): Promise<readonly Carrier[]> {
    this.asked = url;
    return Promise.resolve(this.byUrl.get(url) ?? []);
  }
}

const IMAGE = "https://media.test/products/abc.png";

describe("ListMediaCarriers", () => {
  it("rend les porteurs, nommés", async () => {
    const carriers = new FakeCarriers(
      new Map([
        [
          IMAGE,
          [
            { kind: "product", id: "prd_1", label: "Croissant" },
            { kind: "category", id: "cat_1", label: "Viennoiseries" },
          ] as const,
        ],
      ]),
    );

    const found = await new ListMediaCarriersHandler(carriers).execute(
      new ListMediaCarriersQuery(IMAGE),
    );

    expect(found).toEqual([
      { kind: "product", id: "prd_1", label: "Croissant" },
      { kind: "category", id: "cat_1", label: "Viennoiseries" },
    ]);
  });

  it("rend une liste VIDE pour une orpheline, et non une erreur", async () => {
    // C'est l'état normal d'une image que le ramassage emportera. Lever ici
    // ferait traiter le cas courant comme une panne.
    const carriers = new FakeCarriers();

    const found = await new ListMediaCarriersHandler(carriers).execute(
      new ListMediaCarriersQuery(IMAGE),
    );

    expect(found).toEqual([]);
  });

  it("n'interroge PERSONNE quand l'URL est vide", async () => {
    // Une URL vide ne désigne rien : poser la question ferait balayer les
    // deux tables de rattachement pour un critère que personne ne porte.
    const carriers = new FakeCarriers();

    const found = await new ListMediaCarriersHandler(carriers).execute(
      new ListMediaCarriersQuery("   "),
    );

    expect(found).toEqual([]);
    expect(carriers.asked).toBeNull();
  });

  it("interroge l'URL DÉBARRASSÉE de ses espaces", async () => {
    // Le paramètre vient d'une requête HTTP : un espace de copier-coller ne
    // doit pas faire répondre « aucun porteur » sur une image qui en a.
    const carriers = new FakeCarriers(
      new Map([[IMAGE, [{ kind: "product", id: "prd_1", label: "Croissant" }] as const]]),
    );

    const found = await new ListMediaCarriersHandler(carriers).execute(
      new ListMediaCarriersQuery(` ${IMAGE} `),
    );

    expect(carriers.asked).toBe(IMAGE);
    expect(found).toHaveLength(1);
  });
});
