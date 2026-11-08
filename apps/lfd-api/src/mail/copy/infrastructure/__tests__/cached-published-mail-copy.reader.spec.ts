import type { StoredMailSender } from "../../../senders/application/servable-mail-sender.js";
import { startingMailDocument } from "@lfd/mail-blocks";

import type { StoredPublishedMailCharter } from "../../../charters/application/servable-mail-charter.js";
import type { StoredPublishedMailDocument } from "../../../documents/application/servable-mail-document.js";
import { mailBlockDeclarationOf } from "../../../templates/sections/mail-block-declarations.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { MANIFEST, QR_FIRST, SUBJECT, stamp } from "../../domain/__tests__/mail-copy-fixtures.js";
import type { MailCopyEntryState } from "../../domain/mail-copy-entry.js";
import type { MailSectionOrderState } from "../../domain/mail-section-order.js";
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
    draftDefault: null,
    publishedDefault: null,
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

  orderReads = 0;
  orders: MailSectionOrderState[] = [];

  publishedSectionOrders(): Promise<readonly MailSectionOrderState[]> {
    this.orderReads += 1;
    return Promise.resolve([...this.orders]);
  }

  documentReads = 0;
  documents: StoredPublishedMailDocument[] = [];

  publishedDocuments(): Promise<readonly StoredPublishedMailDocument[]> {
    this.documentReads += 1;
    return Promise.resolve([...this.documents]);
  }

  charterReads = 0;
  charters: StoredPublishedMailCharter[] = [];

  senderReads = 0;
  senderRows: StoredMailSender[] = [];

  senders(): Promise<readonly StoredMailSender[]> {
    this.senderReads += 1;
    return Promise.resolve([...this.senderRows]);
  }

  publishedCharters(): Promise<readonly StoredPublishedMailCharter[]> {
    this.charterReads += 1;
    return Promise.resolve([...this.charters]);
  }
}

function publishedOrder(mail: string, order: readonly string[]): MailSectionOrderState {
  return {
    mail,
    revision: 1,
    draft: { state: "unchanged" },
    drafted: null,
    publishedOrder: order,
    published: stamp(new Date(0)),
  };
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

describe("l'ordre publié des sections, gardé en mémoire (E4)", () => {
  it("rend les ordres qui tiennent encore, par la même version que les textes", async () => {
    const { store, cache } = setup();
    store.orders = [
      publishedOrder(SUBJECT.mail, QR_FIRST),
      publishedOrder(SUBJECT.mail.replace("placed", "ready"), ["title"]),
    ];
    const first = await cache.sectionOrders();
    expect(first).toEqual({ [SUBJECT.mail]: [...QR_FIRST] });
    expect(await cache.sectionOrders()).toBe(first);
    expect([store.versionReads, store.orderReads]).toEqual([1, 1]);
  });

  /** Une section retirée du code depuis la publication : l'ordre du code, pas un ordre à trous. */
  it("écarte un ordre qui ne range plus exactement les sections du code", async () => {
    const { store, cache } = setup();
    store.orders = [publishedOrder(SUBJECT.mail, ["image", "title", "footer"])];
    expect(await cache.sectionOrders()).toEqual({});
  });
});

describe("les documents publiés de l'éditeur par blocs, gardés en mémoire (S4c)", () => {
  const TEMPLATE = "customer.order-placed";
  const starting = startingMailDocument(TEMPLATE, mailBlockDeclarationOf(TEMPLATE));
  const reversed = { template: TEMPLATE, blocks: [...starting.blocks].reverse() };

  it("rend un document qui tient contre le code, par la même version que les textes", async () => {
    const { store, cache } = setup();
    store.documents = [{ template: TEMPLATE, version: 3, document: reversed }];
    const first = await cache.documents();
    expect(first).toEqual({ [TEMPLATE]: { kind: "servable", document: reversed, version: 3 } });
    expect(await cache.documents()).toBe(first);
    expect([store.versionReads, store.documentReads]).toEqual([1, 1]);
  });

  /** Un document écrit par un autre code : l'e-mail part dans l'ordre du code, l'échec dit. */
  it("dit illisible un document sans la forme d'un document, ou qui a perdu un bloc du modèle", async () => {
    const { store, cache } = setup();
    store.documents = [
      { template: TEMPLATE, version: 2, document: { blocks: "pas un tableau" } },
      {
        template: "customer.order-ready",
        version: 1,
        document: { template: "customer.order-ready", blocks: [] },
      },
    ];
    const documents = await cache.documents();
    expect(documents[TEMPLATE]).toMatchObject({ kind: "unreadable", version: 2 });
    const lost = documents["customer.order-ready"];
    expect(lost?.kind).toBe("unreadable");
    expect(lost?.kind === "unreadable" ? lost.reason : "").toContain("model-block-missing");
  });

  it("ignore un e-mail qui n'est plus au registre", async () => {
    const { store, cache } = setup();
    store.documents = [{ template: "retire.du.registre", version: 1, document: reversed }];
    expect(await cache.documents()).toEqual({});
  });

  it("relit les documents quand la version a monté", async () => {
    const { store, clock, cache } = setup();
    await cache.documents();
    clock.advanceMs(MAIL_COPY_VERSION_RECHECK_MS);
    store.current = 2;
    store.documents = [{ template: TEMPLATE, version: 1, document: reversed }];
    expect(Object.keys(await cache.documents())).toEqual([TEMPLATE]);
    expect(store.documentReads).toBe(2);
  });
});

/** C1 (plan de l'éditeur par blocs, § 25) : la charte publiée d'un espace, par la même version. */
describe("les chartes publiées des espaces, gardées en mémoire (C1)", () => {
  const SETTINGS = {
    logo: null,
    colors: {
      page: "#fdfcfb",
      card: "#ffffff",
      text: "#0f172a",
      mutedText: "#64748b",
      primary: "#7a1f3d",
      band: "#1a3157",
      border: "#e2e8f0",
    },
    darkColors: { page: "#0b1220", card: "#111a2e", text: "#e5e9f2", border: "#26324a" },
    headingFont: null,
    textFont: null,
    footer: {},
  };

  it("rend la charte servable, et dit illisible une charte sans la forme d'une charte", async () => {
    const { store, cache } = setup();
    store.charters = [
      { space: "lfd", version: 2, settings: SETTINGS },
      { space: "lfc", version: 1, settings: { couleurs: "bleu" } },
      { space: "internal", version: 1, settings: SETTINGS },
    ];
    expect(await cache.charters()).toEqual({
      lfd: { kind: "servable", settings: SETTINGS, version: 2 },
      lfc: { kind: "unreadable", version: 1 },
    });
  });

  it("rend l'identité d'envoi servable, et dit illisible une identité mal formée (C3)", async () => {
    const { store, cache } = setup();
    const lfd = {
      senderName: "La Folie Douce",
      fromAddress: "no-reply@lfd.test",
      replyToAddress: null,
    };
    store.senderRows = [
      { space: "lfd", ...lfd },
      { space: "lfc", senderName: "LFC", fromAddress: "pas-une-adresse", replyToAddress: null },
      { space: "internal", ...lfd },
    ];
    expect(await cache.senders()).toEqual({
      lfd: { kind: "servable", identity: lfd },
      lfc: { kind: "unreadable" },
    });
  });

  it("ne relit les identités d'envoi que quand la version a monté (C3)", async () => {
    const { store, clock, cache } = setup();
    await cache.senders();
    await cache.senders();
    expect(store.senderReads).toBe(1);
    clock.advanceMs(MAIL_COPY_VERSION_RECHECK_MS);
    store.current = 2;
    await cache.senders();
    expect(store.senderReads).toBe(2);
  });

  it("ne relit les chartes que quand la version a monté", async () => {
    const { store, clock, cache } = setup();
    await cache.charters();
    await cache.charters();
    expect(store.charterReads).toBe(1);
    clock.advanceMs(MAIL_COPY_VERSION_RECHECK_MS);
    store.current = 2;
    store.charters = [{ space: "lfd", version: 1, settings: SETTINGS }];
    expect(Object.keys(await cache.charters())).toEqual(["lfd"]);
    expect(store.charterReads).toBe(2);
  });
});
