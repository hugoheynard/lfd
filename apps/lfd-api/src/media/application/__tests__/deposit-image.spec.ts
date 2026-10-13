import { DirectUnitOfWork } from "../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingMediaJournal } from "../../journal/__tests__/recording-media-journal.js";
import type { RegisteredMedia } from "../../domain/ports/media-library.js";
import { MediaFailureLog, type LoggedFailure } from "../../domain/ports/media-failure-log.js";
import { MediaStore, type StoredAsset } from "../../../platform/storage/media-store.js";
import { UnsupportedImageError } from "../../domain/value-objects/image-bytes.js";
import { MediaSeriesNotFoundError } from "../../domain/errors/media-series-errors.js";
import { MediaAlreadyRegisteredError } from "../../domain/errors/media-library-errors.js";
import { DepositImageCommand, DepositImageHandler } from "../deposit-image.js";
import { DepositPalette } from "../deposit-palette.js";
import { DepositRefusals } from "../deposit-refusals.js";
import {
  FakeLibrary,
  FakeSeries,
  DEPOSITED_HASH,
  FakeStore,
  png,
  RecordingFailures,
  RecordingPalettes,
} from "./deposit-image-doubles.js";

describe("DepositImageHandler", () => {
  it("le fonds range sous un préfixe qui ne nomme aucun porteur", async () => {
    const store = new FakeStore();
    const handler = new DepositImageHandler(
      store,
      new FakeLibrary(),
      new FakeSeries(),
      new RecordingMediaJournal(),
      new DepositRefusals(new RecordingFailures()),
      new DirectUnitOfWork(),
      new DepositPalette(new RecordingPalettes(), new RecordingMediaJournal()),
    );

    await handler.execute(new DepositImageCommand(png(400, 400)));

    expect(store.puts.map((put) => put.prefix)).toEqual(["images"]);
  });

  it("range les octets puis inscrit ce qu'il en a MESURÉ", async () => {
    const store = new FakeStore();
    const library = new FakeLibrary();
    const journal = new RecordingMediaJournal();
    const handler = new DepositImageHandler(
      store,
      library,
      new FakeSeries(),
      journal,
      new DepositRefusals(new RecordingFailures()),
      new DirectUnitOfWork(),
      new DepositPalette(new RecordingPalettes(), new RecordingMediaJournal()),
    );

    const result = await handler.execute(new DepositImageCommand(png(1200, 800)));

    expect(store.puts).toEqual([
      { prefix: "images", asset: { bytes: png(1200, 800), contentType: "image/png" } },
    ]);
    expect(library.registered[0]).toMatchObject({
      url: `https://media.example/images/${DEPOSITED_HASH}.png`,
      storageKey: `images/${DEPOSITED_HASH}.png`,
      contentType: "image/png",
      width: 1200,
      height: 800,
      bytes: 24,
    });
    // 🔴 Un dépôt AFFIRME quelque chose : une image est entrée dans la
    // bibliothèque. Sans ce fait, rien ne dira jamais qui l'a mise là — et une
    // lacune de journal ne se rattrape pas.
    expect(journal.entries).toMatchObject([
      {
        type: "media_asset.deposited",
        subjectType: "media_asset",
        subjectId: `https://media.example/images/${DEPOSITED_HASH}.png`,
        payload: { subjectLabel: `${DEPOSITED_HASH}.png`, contentType: "image/png" },
      },
    ]);
    expect(result.id).toBe("media_1");
  });

  it("refuse AVANT de ranger quoi que ce soit", async () => {
    // L'ordre est la règle : une image refusée ne doit rien laisser derrière
    // elle, ni dans le bucket ni en base.
    const store = new FakeStore();
    const library = new FakeLibrary();
    const handler = new DepositImageHandler(
      store,
      library,
      new FakeSeries(),
      new RecordingMediaJournal(),
      new DepositRefusals(new RecordingFailures()),
      new DirectUnitOfWork(),
      new DepositPalette(new RecordingPalettes(), new RecordingMediaJournal()),
    );

    await expect(
      handler.execute(new DepositImageCommand(Buffer.from("pas une image"))),
    ).rejects.toThrow(UnsupportedImageError);

    expect(store.puts).toEqual([]);
    expect(library.registered).toEqual([]);
  });

  it("INSCRIT le refus, avec le nom du fichier et sa raison", async () => {
    // Régression (2026-09-23) : le compte rendu d'un lot vivait en mémoire.
    // Fermer l'onglet l'effaçait, et sur cinquante fichiers « lequel n'est
    // pas passé » n'avait aucune réponse le lendemain.
    const failures = new RecordingFailures();
    const handler = new DepositImageHandler(
      new FakeStore(),
      new FakeLibrary(),
      new FakeSeries(),
      new RecordingMediaJournal(),
      new DepositRefusals(failures),
      new DirectUnitOfWork(),
      new DepositPalette(new RecordingPalettes(), new RecordingMediaJournal()),
    );

    await expect(
      handler.execute(new DepositImageCommand(Buffer.from("pas une image"), "croissant.heic")),
    ).rejects.toThrow(UnsupportedImageError);

    expect(failures.recorded).toHaveLength(1);
    expect(failures.recorded[0]).toMatchObject({
      fileName: "croissant.heic",
      code: "catalogue.media.unsupported_image",
      // `null` = PAS MESURABLE, jamais « vide » : un refus pour type non
      // supporté n'a, par construction, pas de type constaté.
      contentType: null,
    });
    expect(failures.recorded[0]?.reason).toContain("Visuel refusé");
  });

  it("n'inscrit RIEN quand le dépôt réussit", async () => {
    // L'historique est celui des refus. Y verser les succès en ferait un
    // second journal, avec les mêmes faits que le vrai et une rétention
    // différente — deux vérités sur le même geste.
    const failures = new RecordingFailures();
    const handler = new DepositImageHandler(
      new FakeStore(),
      new FakeLibrary(),
      new FakeSeries(),
      new RecordingMediaJournal(),
      new DepositRefusals(failures),
      new DirectUnitOfWork(),
      new DepositPalette(new RecordingPalettes(), new RecordingMediaJournal()),
    );

    await handler.execute(new DepositImageCommand(png(400, 400), "croissant.png"));

    expect(failures.recorded).toEqual([]);
  });

  it("relance le refus même après l'avoir inscrit", async () => {
    // L'historique OBSERVE, il n'absout pas : l'appelant doit recevoir la
    // raison — c'est elle qui dit quoi corriger.
    class DeafLog extends MediaFailureLog {
      record(): Promise<void> {
        return Promise.reject(new Error("historique en panne"));
      }
      recent(): Promise<readonly LoggedFailure[]> {
        return Promise.resolve([]);
      }
      forgetBefore(): Promise<number> {
        return Promise.resolve(0);
      }
    }
    const handler = new DepositImageHandler(
      new FakeStore(),
      new FakeLibrary(),
      new FakeSeries(),
      new RecordingMediaJournal(),
      new DepositRefusals(new DeafLog()),
      new DirectUnitOfWork(),
      new DepositPalette(new RecordingPalettes(), new RecordingMediaJournal()),
    );

    // ⚠️ Ici l'historique RELANCE, et le refus d'origine est perdu — c'est
    // exactement ce que l'adaptateur réel empêche en avalant sa propre panne.
    // Ce cas fige la frontière : la responsabilité d'avaler est à
    // l'adaptateur, pas au handler, et la déplacer ferait perdre la raison du
    // refus à l'écran.
    await expect(
      handler.execute(new DepositImageCommand(Buffer.from("pas une image"), "x.heic")),
    ).rejects.toThrow("historique en panne");
  });

  it("n'inscrit rien si le rangement échoue", async () => {
    class FailingStore extends MediaStore {
      put(): Promise<StoredAsset> {
        return Promise.reject(new Error("R2 refuse"));
      }
      remove(): Promise<void> {
        return Promise.resolve();
      }
    }
    const library = new FakeLibrary();
    const handler = new DepositImageHandler(
      new FailingStore(),
      library,
      new FakeSeries(),
      new RecordingMediaJournal(),
      new DepositRefusals(new RecordingFailures()),
      new DirectUnitOfWork(),
      new DepositPalette(new RecordingPalettes(), new RecordingMediaJournal()),
    );

    await expect(handler.execute(new DepositImageCommand(png(400, 400)))).rejects.toThrow(
      "R2 refuse",
    );
    expect(library.registered).toEqual([]);
  });

  it("range l'image NEUVE dans la série demandée, et le fait la nomme", async () => {
    const library = new FakeLibrary();
    const journal = new RecordingMediaJournal();
    const handler = new DepositImageHandler(
      new FakeStore(),
      library,
      new FakeSeries(),
      journal,
      new DepositRefusals(new RecordingFailures()),
      new DirectUnitOfWork(),
      new DepositPalette(new RecordingPalettes(), new RecordingMediaJournal()),
    );

    const result = await handler.execute(new DepositImageCommand(png(400, 400), "", "series_ete"));

    expect(library.registered[0]?.seriesId).toBe("series_ete");
    expect(result).toMatchObject({ seriesId: "series_ete", alreadyInLibrary: false });
    expect(journal.entries[0]?.payload).toMatchObject({
      series: { id: "series_ete", name: "Été" },
    });
  });

  it("refuse une série inconnue AVANT de ranger les octets", async () => {
    // Les octets partent au bucket avant la transaction. Vérifier la
    // série après aurait laissé un objet dans le bucket pour un dépôt refusé.
    const store = new FakeStore();
    const library = new FakeLibrary();
    const journal = new RecordingMediaJournal();
    const handler = new DepositImageHandler(
      store,
      library,
      new FakeSeries(),
      journal,
      new DepositRefusals(new RecordingFailures()),
      new DirectUnitOfWork(),
      new DepositPalette(new RecordingPalettes(), new RecordingMediaJournal()),
    );

    await expect(
      handler.execute(new DepositImageCommand(png(400, 400), "", "series_disparue")),
    ).rejects.toThrow(MediaSeriesNotFoundError);
    expect(store.puts).toEqual([]);
    expect(library.registered).toEqual([]);
    expect(journal.entries).toEqual([]);
  });

  it("un redépôt garde la série d'ORIGINE, n'écrit rien, et le dit", async () => {
    const origin: RegisteredMedia = {
      id: "media_0",
      url: `https://media.example/products/${DEPOSITED_HASH}.png`,
      storageKey: `products/${DEPOSITED_HASH}.png`,
      contentType: "image/png",
      width: 400,
      height: 400,
      bytes: 24,
      seriesId: "series_printemps",
    };
    const library = new FakeLibrary([origin]);
    const journal = new RecordingMediaJournal();
    const handler = new DepositImageHandler(
      new FakeStore(),
      library,
      new FakeSeries(),
      journal,
      new DepositRefusals(new RecordingFailures()),
      new DirectUnitOfWork(),
      new DepositPalette(new RecordingPalettes(), new RecordingMediaJournal()),
    );

    const result = await handler.execute(new DepositImageCommand(png(400, 400), "", "series_ete"));

    expect(result).toEqual({ ...origin, alreadyInLibrary: true });
    expect(library.registered).toEqual([]);
    expect(journal.entries).toEqual([]);
  });

  /**
   * Plan du préfixe universel, lot D0 (2026-10-13) : le redépôt cherchait par
   * l'URL. Sous un préfixe changé, les mêmes octets auraient fait une seconde
   * ligne pour une même image.
   */
  it("retrouve l'image par son CONTENU, même rangée sous un autre préfixe", async () => {
    const legacy: RegisteredMedia = {
      id: "media_0",
      url: `https://media.example/legacy/${DEPOSITED_HASH}.png`,
      storageKey: `legacy/${DEPOSITED_HASH}.png`,
      contentType: "image/png",
      width: 400,
      height: 400,
      bytes: 24,
      seriesId: null,
    };
    const library = new FakeLibrary([legacy]);
    const palettes = new RecordingPalettes();
    const handler = new DepositImageHandler(
      new FakeStore(),
      library,
      new FakeSeries(),
      new RecordingMediaJournal(),
      new DepositRefusals(new RecordingFailures()),
      new DirectUnitOfWork(),
      new DepositPalette(palettes, new RecordingMediaJournal()),
    );

    const result = await handler.execute(
      new DepositImageCommand(png(400, 400), "", null, [
        { hex: "#aabbcc", share: 1, outlier: false },
      ]),
    );

    expect(library.askedContent).toEqual([`${DEPOSITED_HASH}.png`]);
    expect(result).toEqual({ ...legacy, alreadyInLibrary: true });
    expect(library.registered).toEqual([]);
    // La palette déduite se pose sur l'URL que les porteurs citent.
    expect(palettes.calls).toEqual([legacy.url]);
  });

  /**
   * Régression : deux dépôts SIMULTANÉS des mêmes octets lisaient tous deux
   * « absente », et le second butait sur l'unicité de l'URL — un 409 « Cette
   * ressource existe déjà » pour un geste qui, successif, rend l'image au fonds.
   */
  it("rend l'image déjà au fonds quand un dépôt simultané l'a inscrite d'abord", async () => {
    const winner: RegisteredMedia = {
      id: "media_0",
      url: `https://media.example/products/${DEPOSITED_HASH}.png`,
      storageKey: `products/${DEPOSITED_HASH}.png`,
      contentType: "image/png",
      width: 400,
      height: 400,
      bytes: 24,
      seriesId: null,
    };
    const handler = new DepositImageHandler(
      new FakeStore(),
      new RacedLibrary(winner),
      new FakeSeries(),
      new RecordingMediaJournal(),
      new DepositRefusals(new RecordingFailures()),
      new DirectUnitOfWork(),
      new DepositPalette(new RecordingPalettes(), new RecordingMediaJournal()),
    );

    const result = await handler.execute(new DepositImageCommand(png(400, 400)));

    expect(result).toEqual({ ...winner, alreadyInLibrary: true });
  });
});

/**
 * Le fonds tel qu'un dépôt concurrent le laisse : absente à la première
 * lecture, prise à l'écriture, présente à la relecture.
 */
class RacedLibrary extends FakeLibrary {
  private reads = 0;

  constructor(private readonly winner: RegisteredMedia) {
    super();
  }

  override holdingContent(): Promise<RegisteredMedia | null> {
    this.reads += 1;
    return Promise.resolve(this.reads === 1 ? null : this.winner);
  }

  override register(entry: Omit<RegisteredMedia, "id">): Promise<RegisteredMedia> {
    return Promise.reject(new MediaAlreadyRegisteredError(entry.url));
  }
}
