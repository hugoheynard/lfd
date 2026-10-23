import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { MANIFEST, SUBJECT, stamp } from "../../domain/__tests__/mail-copy-fixtures.js";
import type { MailCopyEntryState } from "../../domain/mail-copy-entry.js";
import {
  CachedPublishedMailCopyReader,
  MAIL_COPY_VERSION_RECHECK_MS,
} from "../cached-published-mail-copy.reader.js";
import { PublishedMailCopyStore } from "../published-mail-copy.store.js";

function published(locale: "fr" | "en", text: string, path = SUBJECT.path): MailCopyEntryState {
  return {
    mail: SUBJECT.mail,
    path,
    locale,
    revision: 1,
    draft: { state: "unchanged" },
    drafted: null,
    publishedText: text,
    published: stamp(new Date(0)),
  };
}

/** Un magasin qui compte ses lectures — ce que le cache doit épargner. */
class CountingStore extends PublishedMailCopyStore {
  versionReads = 0;
  textReads = 0;
  current = 1;
  rows: MailCopyEntryState[] = [published("fr", "Merci {ref}"), published("en", "Thanks {ref}")];

  version(): Promise<number> {
    this.versionReads += 1;
    return Promise.resolve(this.current);
  }

  published(): Promise<readonly MailCopyEntryState[]> {
    this.textReads += 1;
    return Promise.resolve([...this.rows]);
  }
}

function setup() {
  const store = new CountingStore();
  const clock = new FixedClock(new Date(0));
  return { store, clock, cache: new CachedPublishedMailCopyReader(store, MANIFEST, clock) };
}

describe("les textes d'e-mails publiés, gardés en mémoire", () => {
  it("rend chaque langue, et seulement ce que le code accepte encore", async () => {
    const { store, cache } = setup();
    store.rows.push(
      published("fr", "orphelin", "retire.du.code"),
      published("fr", "sans numéro", "kicker"),
    );

    expect(await cache.read()).toEqual({
      fr: { [SUBJECT.mail]: { subject: "Merci {ref}", kicker: "sans numéro" } },
      en: { [SUBJECT.mail]: { subject: "Thanks {ref}" } },
      it: {},
    });
  });

  it("froid : la version puis les textes ; chaud : aucune lecture", async () => {
    const { store, cache } = setup();
    const first = await cache.read();
    expect([store.versionReads, store.textReads]).toEqual([1, 1]);
    expect(await cache.read()).toBe(first);
    expect([store.versionReads, store.textReads]).toEqual([1, 1]);
  });

  it("tiède : passé le délai, la version seule si rien n'a bougé ; les textes si elle a monté", async () => {
    const { store, clock, cache } = setup();
    await cache.read();
    clock.advanceMs(MAIL_COPY_VERSION_RECHECK_MS);
    await cache.read();
    expect([store.versionReads, store.textReads]).toEqual([2, 1]);

    clock.advanceMs(MAIL_COPY_VERSION_RECHECK_MS);
    store.current = 2;
    store.rows = [published("fr", "Nouveau {ref}")];
    expect((await cache.read()).fr).toEqual({ [SUBJECT.mail]: { subject: "Nouveau {ref}" } });
    expect([store.versionReads, store.textReads]).toEqual([3, 2]);
  });

  it("oublié après une publication ici : relu tout de suite", async () => {
    const { store, cache } = setup();
    await cache.read();
    cache.forget();
    await cache.read();
    expect([store.versionReads, store.textReads]).toEqual([2, 2]);
  });
});
