import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { CART_TITLE, GREETING, MANIFEST } from "../../domain/__tests__/shop-copy-fixtures.js";
import {
  InvalidShopCopyTextError,
  NothingToPublishError,
  ShopCopyChangedError,
  ShopCopyPublishedMeanwhileError,
  UnknownShopCopyKeyError,
} from "../../domain/shop-copy-errors.js";
import { ShopCopyPublishedEvent } from "../../domain/shop-copy.events.js";
import { ApplyShopCopyRenames } from "../apply-shop-copy-renames.js";
import { PublishShopCopyCommand } from "../commands/publish-shop-copy.command.js";
import { PublishShopCopyHandler } from "../commands/publish-shop-copy.handler.js";
import { ResetShopCopyDraftCommand } from "../commands/reset-shop-copy-draft.command.js";
import { ResetShopCopyDraftHandler } from "../commands/reset-shop-copy-draft.handler.js";
import { SaveShopCopyDraftCommand } from "../commands/save-shop-copy-draft.command.js";
import { SaveShopCopyDraftHandler } from "../commands/save-shop-copy-draft.handler.js";
import { GetPublishedShopCopyHandler } from "../queries/get-published-shop-copy.handler.js";
import { GetPublishedShopCopyQuery } from "../queries/get-published-shop-copy.query.js";
import {
  InMemoryReleases,
  InMemoryShopCopy,
  RecordingCache,
  RecordingRenamer,
  StaticPublished,
} from "./shop-copy-doubles.js";

const AT = new Date(0);
const STAFF = "fiche-colette";

function world() {
  const texts = new InMemoryShopCopy();
  const releases = new InMemoryReleases(texts);
  const cache = new RecordingCache();
  const events = new RecordingPublisher();
  const clock = new FixedClock(AT);
  const uow = new DirectUnitOfWork();
  return {
    texts,
    releases,
    cache,
    events,
    draft: new SaveShopCopyDraftHandler(texts, MANIFEST, clock, uow),
    reset: new ResetShopCopyDraftHandler(texts, clock, uow),
    publish: new PublishShopCopyHandler(releases, MANIFEST, cache, events, clock, uow),
  };
}

describe("écrire un brouillon", () => {
  it("pose le remplacement, l'auteur et l'instant", async () => {
    const w = world();
    await w.draft.execute(
      new SaveShopCopyDraftCommand(CART_TITLE.key, "fr", "Mon panier", 0, STAFF),
    );
    expect(w.texts.state(CART_TITLE.key, "fr")).toMatchObject({
      revision: 1,
      draft: { state: "set", text: "Mon panier" },
      drafted: { at: AT, staffId: STAFF },
    });
  });

  it("refuse en 409 l'écran qui a lu une révision dépassée", async () => {
    const w = world();
    await w.draft.execute(
      new SaveShopCopyDraftCommand(CART_TITLE.key, "fr", "Mon panier", 0, STAFF),
    );
    await expect(
      w.draft.execute(
        new SaveShopCopyDraftCommand(CART_TITLE.key, "fr", "Votre panier", 0, "autre"),
      ),
    ).rejects.toBeInstanceOf(ShopCopyChangedError);
    expect(w.texts.state(CART_TITLE.key, "fr")?.draft).toEqual({
      state: "set",
      text: "Mon panier",
    });
  });

  it("refuse une clé inconnue et un texte invalide, sans rien écrire", async () => {
    const w = world();
    await expect(
      w.draft.execute(new SaveShopCopyDraftCommand("pas.une.cle", "fr", "x", 0, STAFF)),
    ).rejects.toBeInstanceOf(UnknownShopCopyKeyError);
    await expect(
      w.draft.execute(new SaveShopCopyDraftCommand(GREETING.key, "fr", "Bonjour", 0, STAFF)),
    ).rejects.toBeInstanceOf(InvalidShopCopyTextError);
    expect(w.texts.rows.size).toBe(0);
  });
});

describe("publier", () => {
  it("applique tous les brouillons, monte la version, journalise avant/après, oublie le cache", async () => {
    const w = world();
    await w.draft.execute(
      new SaveShopCopyDraftCommand(CART_TITLE.key, "fr", "Mon panier", 0, STAFF),
    );
    await w.draft.execute(new SaveShopCopyDraftCommand(GREETING.key, "en", "Hi {name}", 0, STAFF));

    expect(await w.publish.execute(new PublishShopCopyCommand(STAFF))).toBe(1);

    expect(w.texts.version).toBe(1);
    expect(w.texts.state(CART_TITLE.key, "fr")).toMatchObject({
      draft: { state: "unchanged" },
      publishedText: "Mon panier",
      published: { at: AT, staffId: STAFF },
    });
    expect(w.events.factTypes()).toEqual(["shop_copy.published"]);
    const [event] = w.events.traced;
    expect(event).toBeInstanceOf(ShopCopyPublishedEvent);
    expect(event?.journalFact().payload).toEqual({
      subjectLabel: "Textes de la boutique",
      version: 1,
      changes: [
        { key: CART_TITLE.key, locale: "fr", before: null, after: "Mon panier" },
        { key: GREETING.key, locale: "en", before: null, after: "Hi {name}" },
      ],
    });
    expect(w.cache.forgotten).toBe(1);
  });

  it("« revenir à l'original » publie un texte nul, et le fait dit ce qui est retiré", async () => {
    const w = world();
    await w.draft.execute(
      new SaveShopCopyDraftCommand(CART_TITLE.key, "fr", "Mon panier", 0, STAFF),
    );
    await w.publish.execute(new PublishShopCopyCommand(STAFF));
    await w.reset.execute(new ResetShopCopyDraftCommand(CART_TITLE.key, "fr", 1, STAFF));

    // Rien ne change en boutique avant « Publier ».
    expect(w.texts.state(CART_TITLE.key, "fr")?.publishedText).toBe("Mon panier");
    expect(await w.publish.execute(new PublishShopCopyCommand(STAFF))).toBe(2);
    expect(w.texts.state(CART_TITLE.key, "fr")?.publishedText).toBeNull();
    expect(w.events.traced[1]?.journalFact().payload).toMatchObject({
      version: 2,
      changes: [{ key: CART_TITLE.key, locale: "fr", before: "Mon panier", after: null }],
    });
  });

  it("refuse de publier sans brouillon, sans fait ni version", async () => {
    const w = world();
    await expect(w.publish.execute(new PublishShopCopyCommand(STAFF))).rejects.toBeInstanceOf(
      NothingToPublishError,
    );
    expect(w.events.traced).toHaveLength(0);
    expect(w.cache.forgotten).toBe(0);
  });

  it("une publication concurrente refuse la seconde, qui n'oublie pas le cache", async () => {
    const w = world();
    await w.draft.execute(
      new SaveShopCopyDraftCommand(CART_TITLE.key, "fr", "Mon panier", 0, STAFF),
    );
    w.releases.raceVersion = true;
    await expect(w.publish.execute(new PublishShopCopyCommand(STAFF))).rejects.toBeInstanceOf(
      ShopCopyPublishedMeanwhileError,
    );
    expect(w.cache.forgotten).toBe(0);
  });
});

describe("lire le publié pour la boutique", () => {
  it("ne sert pas une orpheline", async () => {
    const handler = new GetPublishedShopCopyHandler(
      new StaticPublished({
        version: 4,
        texts: { [CART_TITLE.key]: "Mon panier", "retire.du.code": "x" },
      }),
      MANIFEST,
    );
    expect(await handler.execute(new GetPublishedShopCopyQuery("fr"))).toEqual({
      locale: "fr",
      version: 4,
      texts: { [CART_TITLE.key]: "Mon panier" },
    });
  });
});

describe("reporter les renommages", () => {
  it("déplace dans l'ordre du fichier, puis oublie le cache", async () => {
    const renamer = new RecordingRenamer(2);
    const cache = new RecordingCache();
    const apply = new ApplyShopCopyRenames(renamer, cache, new DirectUnitOfWork());

    expect(
      await apply.apply([
        ["cart.old", "cart.title"],
        ["a.b", "a.c"],
      ]),
    ).toBe(4);
    expect(renamer.calls).toEqual([
      ["cart.old", "cart.title"],
      ["a.b", "a.c"],
    ]);
    expect(cache.forgotten).toBe(1);
  });

  it("ne touche rien, et garde le cache, quand rien n'a bougé", async () => {
    const renamer = new RecordingRenamer(0);
    const cache = new RecordingCache();
    const apply = new ApplyShopCopyRenames(renamer, cache, new DirectUnitOfWork());

    expect(await apply.apply([["x", "y"]])).toBe(0);
    expect(await apply.apply([])).toBe(0);
    expect(renamer.calls).toEqual([["x", "y"]]);
    expect(cache.forgotten).toBe(0);
  });
});
