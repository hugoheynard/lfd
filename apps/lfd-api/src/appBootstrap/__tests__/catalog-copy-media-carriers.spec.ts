import {
  catalogMediaCopyLabel,
  CatalogMediaCopies,
  type CatalogMediaCopy,
} from "../../b2b/catalog/channels/media/catalog-media-copies.js";
import { MediaCarriers } from "../../media/channels/carriers/media-carriers.js";
import { RecordingMediaJournal } from "../../media/journal/__tests__/recording-media-journal.js";
import { CatalogCopyMediaCarriers } from "../catalog-copy-media-carriers.js";

const IMAGE = "https://media.test/noel.png";

/** Les copies du catalogue, doublées : elles répondent ce qu'on leur a mis. */
class StubCopies extends CatalogMediaCopies {
  constructor(
    private readonly counts: ReadonlyMap<string, number>,
    private readonly copies: readonly CatalogMediaCopy[],
  ) {
    super();
  }

  usesOf(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(this.counts);
  }

  copiesOf(): Promise<readonly CatalogMediaCopy[]> {
    return Promise.resolve(this.copies);
  }
}

describe("CatalogCopyMediaCarriers", () => {
  it("rend les comptes des copies tels quels", async () => {
    const carriers = new CatalogCopyMediaCarriers(new StubCopies(new Map([[IMAGE, 1]]), []));

    expect(await carriers.usesOf([IMAGE])).toEqual(new Map([[IMAGE, 1]]));
  });

  it("relaie le libellé que le commerce rédige, la clé pour identifiant", async () => {
    const carriers = new CatalogCopyMediaCarriers(
      new StubCopies(new Map(), [{ operationKey: "noel", label: catalogMediaCopyLabel("Noël") }]),
    );

    expect(await carriers.carriersOf(IMAGE)).toEqual([
      {
        kind: "operation",
        id: "noel",
        label: "Boutique — opération « Noël » (copie, suit en quelques secondes)",
      },
    ]);
  });

  /** Une copie suit au push suivant — la réécrire ici devancerait le référentiel. */
  it("ne repointe rien et rend 0, même quand une copie montre l'image", async () => {
    // Typé par le port : c'est par lui que le composite l'appelle.
    const carriers: MediaCarriers = new CatalogCopyMediaCarriers(
      new StubCopies(new Map([[IMAGE, 1]]), [
        { operationKey: "noel", label: catalogMediaCopyLabel("Noël") },
      ]),
    );
    const replacement = {
      from: IMAGE,
      to: "https://media.test/b.png",
      staffId: "s",
      at: new Date(0),
    };

    expect(await carriers.repoint(replacement, new RecordingMediaJournal().untraced("test"))).toBe(
      0,
    );
    expect(await carriers.carriersOf(IMAGE)).toHaveLength(1);
  });
});
