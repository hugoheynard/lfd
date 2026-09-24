import { MediaCarriers, type Carrier } from "../../media/channels/carriers/media-carriers.js";
import { CompositeMediaCarriers } from "../composite-media-carriers.js";

/** Un porteur qui répond ce qu'on lui a mis, pour toutes les URL. */
class StubCarriers extends MediaCarriers {
  constructor(
    private readonly counts: ReadonlyMap<string, number>,
    private readonly named: readonly Carrier[] = [],
  ) {
    super();
  }

  usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(new Map([...this.counts].filter(([url]) => urls.includes(url))));
  }

  carriersOf(): Promise<readonly Carrier[]> {
    return Promise.resolve(this.named);
  }
}

/** Un porteur en panne — il ne répond jamais. */
class BrokenCarriers extends MediaCarriers {
  usesOf(): Promise<ReadonlyMap<string, number>> {
    return Promise.reject(new Error("vitrine injoignable"));
  }

  carriersOf(): Promise<readonly Carrier[]> {
    return Promise.reject(new Error("vitrine injoignable"));
  }
}

const A = "https://media.test/a.png";
const B = "https://media.test/b.png";
const C = "https://media.test/c.png";

describe("CompositeMediaCarriers", () => {
  it("SOMME les emplois de tous les porteurs, URL par URL", async () => {
    const composite = new CompositeMediaCarriers([
      new StubCarriers(
        new Map([
          [A, 2],
          [B, 1],
        ]),
      ),
      new StubCarriers(new Map([[A, 3]])),
    ]);

    const uses = await composite.usesOf([A, B, C]);

    expect(uses).toEqual(
      new Map([
        [A, 5],
        [B, 1],
      ]),
    );
    // Une URL que personne n'affiche reste ABSENTE, comme le port le promet.
    expect(uses.has(C)).toBe(false);
  });

  it("CONCATÈNE les porteurs nommés, dans l'ordre des porteurs", async () => {
    const composite = new CompositeMediaCarriers([
      new StubCarriers(new Map(), [{ kind: "product", id: "prd_1", label: "Croissant" }]),
      new StubCarriers(new Map(), [{ kind: "storefront", id: "obj_1", label: "Noël" }]),
    ]);

    expect(await composite.carriersOf(A)).toEqual([
      { kind: "product", id: "prd_1", label: "Croissant" },
      { kind: "storefront", id: "obj_1", label: "Noël" },
    ]);
  });

  /**
   * 🔴 Le silence d'un porteur ne vaut pas « zéro emploi » : avaler son échec
   * ferait supprimer une image que lui seul affiche.
   */
  it("ÉCHOUE sur le compte dès qu'UN porteur échoue", async () => {
    const composite = new CompositeMediaCarriers([
      new StubCarriers(new Map([[A, 1]])),
      new BrokenCarriers(),
    ]);

    await expect(composite.usesOf([A])).rejects.toThrow("vitrine injoignable");
  });

  it("ÉCHOUE sur la liste dès qu'UN porteur échoue", async () => {
    const composite = new CompositeMediaCarriers([
      new StubCarriers(new Map(), [{ kind: "product", id: "prd_1", label: "Croissant" }]),
      new BrokenCarriers(),
    ]);

    await expect(composite.carriersOf(A)).rejects.toThrow("vitrine injoignable");
  });
});
