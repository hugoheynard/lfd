import { BrowseMediaLibraryHandler, BrowseMediaLibraryQuery } from "../browse-media-library.js";
import {
  MediaLibraryReader,
  type LibraryMediaPage,
  type LibraryMediaRecord,
  type LibraryQuery,
} from "../../domain/ports/media-library-reader.js";

/**
 * Un lecteur qui n'interroge rien et **retient ce qu'on lui demande**.
 *
 * C'est la requête reçue qui compte ici, pas les lignes rendues : ce que ce
 * handler décide, c'est le bornage et le passage du filtre. Un doublé qui
 * rendrait des images sans garder la requête ne prouverait rien des deux.
 */
class SpyingReader extends MediaLibraryReader {
  asked: LibraryQuery | null = null;

  page(query: LibraryQuery): Promise<LibraryMediaPage> {
    this.asked = query;
    return Promise.resolve({ items: [], total: 0 });
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

    await handlerOn(reader).execute(new BrowseMediaLibraryQuery(5000, 0));

    expect(reader.asked?.limit).toBe(100);
  });

  it("refuse un décalage négatif plutôt que de le passer à la base", async () => {
    const reader = new SpyingReader();

    await handlerOn(reader).execute(new BrowseMediaLibraryQuery(10, -40));

    expect(reader.asked?.offset).toBe(0);
  });
});

describe("BrowseMediaLibrary — la recherche", () => {
  it("transmet le texte cherché au lecteur", async () => {
    // Régression (2026-09-23) : la recherche filtrait ce qui était CHARGÉ. Le
    // sélecteur en charge cent, donc l'image cent-unième était introuvable
    // quoi qu'on tape — et rien à l'écran ne le disait.
    const reader = new SpyingReader();

    await handlerOn(reader).execute(new BrowseMediaLibraryQuery(60, 0, "croissant", undefined));

    expect(reader.asked?.q).toBe("croissant");
  });

  it("transmet les mots-clés retenus", async () => {
    const reader = new SpyingReader();

    await handlerOn(reader).execute(
      new BrowseMediaLibraryQuery(60, 0, undefined, ["viennoiserie", "packshot"]),
    );

    expect(reader.asked?.tags).toEqual(["viennoiserie", "packshot"]);
  });

  it("ne pose AUCUN critère quand on n'en demande pas", async () => {
    // L'absence et le vide ne se disent pas pareil : `q: ""` serait un filtre
    // qui accepte tout, donc un `where` posé pour rien — et le lecteur suivant
    // croirait qu'un filtre est toujours là.
    const reader = new SpyingReader();

    await handlerOn(reader).execute(new BrowseMediaLibraryQuery(60, 0));

    expect(reader.asked).toEqual({ limit: 60, offset: 0 });
  });
});
