import {
  VitrineArticleNotFoundError,
  VitrineReadKeyRefusedError,
} from "../../../domain/errors/vitrine-errors.js";
import { VitrineContents } from "../../../domain/vitrine-contents.js";
import { catalogue, item } from "../../../domain/__tests__/vitrine-fixtures.js";
import { KeyedSubscribers, StaticShowcase } from "../../commands/__tests__/vitrine-doubles.js";
import { ReadVitrineArticleHandler } from "../read-vitrine-article.handler.js";
import { ReadVitrineArticleQuery } from "../read-vitrine-article.query.js";
import { ReadVitrineCatalogueHandler } from "../read-vitrine-catalogue.handler.js";
import { ReadVitrineCatalogueQuery } from "../read-vitrine-catalogue.query.js";
import { ReadVitrineTextsHandler } from "../read-vitrine-texts.handler.js";
import { ReadVitrineTextsQuery } from "../read-vitrine-texts.query.js";

const KEY = "vtrkey_TEST";

describe("les lectures de l'agence", () => {
  it("la clé applique les cases de son abonné", async () => {
    const shop = new StaticShowcase();
    const view = await new ReadVitrineCatalogueHandler(
      KeyedSubscribers.of(KEY, VitrineContents.of(["catalogue"])),
      shop,
    ).execute(new ReadVitrineCatalogueQuery(KEY, "it"));
    expect(view.language).toBe("it");
    expect(view.operations).toEqual([]);
    expect(view.items.every((entry) => !("isFeatured" in entry))).toBe(true);
  });

  it.each([undefined, "", "vtrkey_INCONNUE"])(
    "refuse une clé absente ou inconnue (%s)",
    async (key) => {
      const handler = new ReadVitrineCatalogueHandler(
        KeyedSubscribers.of(KEY, VitrineContents.of(["catalogue"])),
        new StaticShowcase(),
      );
      await expect(handler.execute(new ReadVitrineCatalogueQuery(key, "fr"))).rejects.toThrow(
        VitrineReadKeyRefusedError,
      );
    },
  );

  it("refuse la clé d'un abonné coupé, comme une clé inconnue — et la rend rallumé", async () => {
    const read = (active: boolean) =>
      new ReadVitrineCatalogueHandler(
        KeyedSubscribers.of(KEY, VitrineContents.of(["catalogue"]), active),
        new StaticShowcase(),
      ).execute(new ReadVitrineCatalogueQuery(KEY, "fr"));
    const cut = await read(false).catch((error: unknown) => error);
    const unknown = await new ReadVitrineCatalogueHandler(
      KeyedSubscribers.of(KEY, VitrineContents.of(["catalogue"])),
      new StaticShowcase(),
    )
      .execute(new ReadVitrineCatalogueQuery("vtrkey_INCONNUE", "fr"))
      .catch((error: unknown) => error);
    expect(cut).toBeInstanceOf(VitrineReadKeyRefusedError);
    expect(cut).toEqual(unknown);
    await expect(read(true)).resolves.toMatchObject({ language: "fr" });
  });

  it("un article pro ou hors des cases est introuvable", async () => {
    const shop = new StaticShowcase();
    shop.view = catalogue({ items: [item("PUB-01"), item("PRO-01", { audience: "pro" })] });
    const handler = new ReadVitrineArticleHandler(
      KeyedSubscribers.of(KEY, VitrineContents.of(["catalogue"])),
      shop,
    );
    expect((await handler.execute(new ReadVitrineArticleQuery(KEY, "PUB-01", "fr"))).sku).toBe(
      "PUB-01",
    );
    await expect(handler.execute(new ReadVitrineArticleQuery(KEY, "PRO-01", "fr"))).rejects.toThrow(
      VitrineArticleNotFoundError,
    );
  });

  it("les textes ne sortent qu'avec leur case", async () => {
    const shop = new StaticShowcase();
    const read = (contents: VitrineContents) =>
      new ReadVitrineTextsHandler(KeyedSubscribers.of(KEY, contents), shop).execute(
        new ReadVitrineTextsQuery(KEY, "en"),
      );
    expect((await read(VitrineContents.of(["texts"]))).texts).toEqual({
      "product.bestSeller": "Incontournable",
    });
    expect((await read(VitrineContents.of(["catalogue"]))).texts).toEqual({});
  });
});
