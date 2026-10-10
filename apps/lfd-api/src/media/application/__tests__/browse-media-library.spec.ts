import { BrowseMediaLibraryHandler, BrowseMediaLibraryQuery } from "../browse-media-library.js";
import {
  MediaLibraryReader,
  type LibraryMediaPage,
  type LibraryMediaRecord,
  type LibraryQuery,
} from "../../domain/ports/media-library-reader.js";
import {
  encodeLibraryCursor,
  InvalidLibraryCursorError,
} from "../../domain/value-objects/library-cursor.js";
import type { LibraryPosition } from "../../domain/value-objects/library-order.js";
import { InvalidDepositPeriodError } from "../library-period.js";
import { UnsupportedLibraryOffsetError } from "../browse-media-library.js";

/**
 * Un lecteur qui n'interroge rien et **retient ce qu'on lui demande**.
 *
 * C'est la requête reçue qui compte ici, pas les lignes rendues : ce que ce
 * handler décide, c'est le bornage et le passage du filtre. Un doublé qui
 * rendrait des images sans garder la requête ne prouverait rien des deux.
 */
class SpyingReader extends MediaLibraryReader {
  asked: LibraryQuery | null = null;
  next: LibraryPosition | null = null;

  page(query: LibraryQuery): Promise<LibraryMediaPage> {
    this.asked = query;
    return Promise.resolve({ items: [], total: 0, next: this.next });
  }

  /** Hors sujet ici, mais le port l'exige — et c'est ce qui rend ce doublé
   *  substituable au vrai : un `as unknown as` aurait laissé la spec verte le
   *  jour où le port change. */
  find(): Promise<LibraryMediaRecord | null> {
    return Promise.resolve(null);
  }
}

function handlerOn(reader: SpyingReader): BrowseMediaLibraryHandler {
  return new BrowseMediaLibraryHandler(reader);
}

describe("BrowseMediaLibrary — le bornage", () => {
  it("plafonne une page qu'on demanderait trop grande", async () => {
    // « Donne-moi toute la bibliothèque » n'est pas une intention qu'on sert :
    // le contrôleur peut se tromper, un test aussi.
    const reader = new SpyingReader();

    await handlerOn(reader).execute(new BrowseMediaLibraryQuery({ limit: 5000 }));

    expect(reader.asked?.limit).toBe(100);
  });

  it("refuse un décalage négatif plutôt que de le passer à la base", async () => {
    const reader = new SpyingReader();

    await handlerOn(reader).execute(new BrowseMediaLibraryQuery({ limit: 10, offset: -40 }));

    expect(reader.asked?.offset).toBe(0);
  });
});

describe("BrowseMediaLibrary — la recherche", () => {
  it("transmet le texte cherché au lecteur", async () => {
    // Régression (2026-09-23) : la recherche filtrait ce qui était CHARGÉ. Le
    // sélecteur en charge cent, donc l'image cent-unième était introuvable
    // quoi qu'on tape — et rien à l'écran ne le disait.
    const reader = new SpyingReader();

    await handlerOn(reader).execute(new BrowseMediaLibraryQuery({ q: "croissant" }));

    expect(reader.asked?.q).toBe("croissant");
  });

  it("transmet les mots-clés retenus", async () => {
    const reader = new SpyingReader();

    await handlerOn(reader).execute(
      new BrowseMediaLibraryQuery({ tags: ["viennoiserie", "packshot"] }),
    );

    expect(reader.asked?.tags).toEqual(["viennoiserie", "packshot"]);
  });

  it("ne pose AUCUN critère quand on n'en demande pas", async () => {
    // L'absence et le vide ne se disent pas pareil : `q: ""` serait un filtre
    // qui accepte tout, donc un `where` posé pour rien — et le lecteur suivant
    // croirait qu'un filtre est toujours là.
    const reader = new SpyingReader();

    await handlerOn(reader).execute(new BrowseMediaLibraryQuery());

    expect(reader.asked).toEqual({ limit: 60, offset: 0, sort: "deposited" });
  });
});

describe("BrowseMediaLibrary — le curseur", () => {
  const POSITION: LibraryPosition = {
    sort: "name",
    key: "croissant",
    url: "https://media.test/products/a.png",
  };

  it("relit le curseur et le passe au lecteur comme une position", async () => {
    const reader = new SpyingReader();

    await handlerOn(reader).execute(
      new BrowseMediaLibraryQuery({ sort: "name", after: encodeLibraryCursor(POSITION) }),
    );

    expect(reader.asked?.after).toEqual(POSITION);
    expect(reader.asked?.sort).toBe("name");
  });

  it("rend la position suivante en curseur opaque, et `null` en fin de fonds", async () => {
    const reader = new SpyingReader();
    reader.next = POSITION;

    const page = await handlerOn(reader).execute(new BrowseMediaLibraryQuery({ sort: "name" }));

    expect(page.next).toBe(encodeLibraryCursor(POSITION));
    reader.next = null;
    expect((await handlerOn(reader).execute(new BrowseMediaLibraryQuery())).next).toBeNull();
  });

  it("refuse un curseur illisible AVANT d'interroger le fonds", async () => {
    // Repartir du début en silence réafficherait des images déjà vues.
    const reader = new SpyingReader();

    await expect(
      handlerOn(reader).execute(new BrowseMediaLibraryQuery({ after: "pas-un-curseur" })),
    ).rejects.toBeInstanceOf(InvalidLibraryCursorError);
    expect(reader.asked).toBeNull();
  });

  it("refuse un curseur émis pour un autre ordre", async () => {
    const reader = new SpyingReader();

    await expect(
      handlerOn(reader).execute(
        new BrowseMediaLibraryQuery({ sort: "deposited", after: encodeLibraryCursor(POSITION) }),
      ),
    ).rejects.toBeInstanceOf(InvalidLibraryCursorError);
  });

  it("refuse un décalage combiné à un curseur ou à un autre ordre que le dépôt", async () => {
    const reader = new SpyingReader();
    const handler = handlerOn(reader);

    await expect(
      handler.execute(
        new BrowseMediaLibraryQuery({
          sort: "name",
          offset: 60,
          after: encodeLibraryCursor(POSITION),
        }),
      ),
    ).rejects.toBeInstanceOf(UnsupportedLibraryOffsetError);
    await expect(
      handler.execute(new BrowseMediaLibraryQuery({ sort: "uses", offset: 60 })),
    ).rejects.toBeInstanceOf(UnsupportedLibraryOffsetError);
    expect(reader.asked).toBeNull();
  });
});

describe("BrowseMediaLibrary — les filtres", () => {
  it("lit la période à l'heure de Paris, dernier jour inclus", async () => {
    // L'heure d'été : minuit à Paris est 22 h UTC la veille. Un filtre en UTC
    // rangerait une image déposée le 1er à 0 h 30 dans le mois d'avant.
    const reader = new SpyingReader();

    await handlerOn(reader).execute(
      new BrowseMediaLibraryQuery({ from: "2026-07-01", to: "2026-07-31" }),
    );

    expect(reader.asked?.depositedFrom?.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(reader.asked?.depositedBefore?.toISOString()).toBe("2026-07-31T22:00:00.000Z");
  });

  it("refuse une période à l'envers et un jour qui n'existe pas", async () => {
    const reader = new SpyingReader();
    const handler = handlerOn(reader);

    await expect(
      handler.execute(new BrowseMediaLibraryQuery({ from: "2026-07-31", to: "2026-07-01" })),
    ).rejects.toBeInstanceOf(InvalidDepositPeriodError);
    await expect(
      handler.execute(new BrowseMediaLibraryQuery({ from: "2026-02-31" })),
    ).rejects.toBeInstanceOf(InvalidDepositPeriodError);
  });

  it("transmet « non taguées » et « inutilisées », et rien quand ils sont baissés", async () => {
    const reader = new SpyingReader();
    const handler = handlerOn(reader);

    await handler.execute(new BrowseMediaLibraryQuery({ untagged: true, unused: true }));
    expect(reader.asked).toMatchObject({ untagged: true, unused: true });

    await handler.execute(new BrowseMediaLibraryQuery({ untagged: false, unused: false }));
    expect(reader.asked).toEqual({ limit: 60, offset: 0, sort: "deposited" });
  });
});
