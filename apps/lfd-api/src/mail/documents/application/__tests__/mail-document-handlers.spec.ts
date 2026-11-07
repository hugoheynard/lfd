import {
  startingMailDocument,
  type MailDocument,
  type MailTemplateDeclaration,
} from "@lfd/mail-blocks";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  InMemoryMailCopy,
  InMemoryReleases,
  RecordingCache,
} from "../../../copy/application/__tests__/mail-copy-doubles.js";
import { SaveMailCopyDraftCommand } from "../../../copy/application/commands/save-mail-copy-draft.command.js";
import { SaveMailCopyDraftHandler } from "../../../copy/application/commands/save-mail-copy-draft.handler.js";
import { MANIFEST, SUBJECT, TITLE } from "../../../copy/domain/__tests__/mail-copy-fixtures.js";
import { MailCopyPublishedEvent } from "../../../copy/domain/mail-copy.events.js";
import {
  MailDocumentChangedError,
  MailDocumentRefusedError,
  NothingToPublishForMailError,
  NothingToRevertError,
  UnknownMailTemplateError,
} from "../../domain/mail-document-errors.js";
import {
  MailDocumentPublishedEvent,
  MailDocumentRetractedEvent,
  MailDocumentSavedEvent,
} from "../../domain/mail-document.events.js";
import { PublishMailDocumentCommand } from "../commands/publish-mail-document.command.js";
import { PublishMailDocumentHandler } from "../commands/publish-mail-document.handler.js";
import { RevertMailDocumentCommand } from "../commands/revert-mail-document.command.js";
import { RevertMailDocumentHandler } from "../commands/revert-mail-document.handler.js";
import { SaveMailDocumentDraftCommand } from "../commands/save-mail-document-draft.command.js";
import { SaveMailDocumentDraftHandler } from "../commands/save-mail-document-draft.handler.js";
import { FixedCatalogue, InMemoryMailDocuments, entryOf } from "./mail-document-doubles.js";

const TEMPLATE = SUBJECT.mail;
const DECLARATION: MailTemplateDeclaration = {
  modelBlocks: ["title", "body", "image", "footer"],
  locales: ["fr", "en", "it"],
  charter: "lfc",
};
const STARTING = startingMailDocument(TEMPLATE, DECLARATION);
const REVERSED: MailDocument = { template: TEMPLATE, blocks: [...STARTING.blocks].reverse() };
const STAFF = "fiche-colette";
const AT = new Date(0);

function world() {
  const texts = new InMemoryMailCopy();
  const releases = new InMemoryReleases(texts);
  const documents = new InMemoryMailDocuments();
  const catalogue = new FixedCatalogue([entryOf(TEMPLATE, DECLARATION)]);
  const cache = new RecordingCache();
  const events = new RecordingPublisher();
  const clock = new FixedClock(AT);
  const uow = new DirectUnitOfWork();
  return {
    texts,
    documents,
    cache,
    events,
    save: new SaveMailDocumentDraftHandler(documents, catalogue, events, clock, uow),
    publish: new PublishMailDocumentHandler(
      documents,
      releases,
      catalogue,
      MANIFEST,
      cache,
      events,
      clock,
      uow,
    ),
    revert: new RevertMailDocumentHandler(
      documents,
      releases,
      catalogue,
      cache,
      events,
      clock,
      uow,
    ),
    phrase: new SaveMailCopyDraftHandler(texts, MANIFEST, clock, uow),
  };
}

describe("enregistrer le brouillon de l'arrangement", () => {
  it("crée la ligne à la première modification et journalise le geste", async () => {
    const w = world();
    await w.save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, REVERSED, 0, STAFF));
    expect(w.documents.rows.get(TEMPLATE)).toMatchObject({
      revision: 1,
      draft: { document: REVERSED, stamp: { at: AT, staffId: STAFF } },
    });
    expect(w.events.published).toEqual([new MailDocumentSavedEvent(TEMPLATE, 1)]);
  });

  it("refuse un e-mail hors du registre, un document invalide, une révision dépassée", async () => {
    const w = world();
    await expect(
      w.save.execute(new SaveMailDocumentDraftCommand("inconnu", REVERSED, 0, STAFF)),
    ).rejects.toBeInstanceOf(UnknownMailTemplateError);
    await expect(
      w.save.execute(
        new SaveMailDocumentDraftCommand(TEMPLATE, { template: TEMPLATE, blocks: [] }, 0, STAFF),
      ),
    ).rejects.toBeInstanceOf(MailDocumentRefusedError);
    await w.save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, REVERSED, 0, STAFF));
    await expect(
      w.save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, STARTING, 0, STAFF)),
    ).rejects.toBeInstanceOf(MailDocumentChangedError);
    expect(w.events.published).toHaveLength(1);
  });
});

describe("publier : l'arrangement et les phrases, ensemble", () => {
  it("publie le document ET la phrase en attente de cet e-mail, sous la même version", async () => {
    const w = world();
    await w.phrase.execute(
      new SaveMailCopyDraftCommand(TEMPLATE, SUBJECT.path, "fr", "Merci {ref}", 0, STAFF),
    );
    await w.save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, REVERSED, 0, STAFF));

    const version = await w.publish.execute(new PublishMailDocumentCommand(TEMPLATE, 1, STAFF));

    expect(version).toBe(1);
    expect(w.texts.version).toBe(1);
    expect(w.texts.state(TEMPLATE, SUBJECT.path, "fr")?.publishedText).toBe("Merci {ref}");
    expect(w.documents.rows.get(TEMPLATE)?.published?.version).toBe(1);
    expect(w.documents.versions.map((entry) => entry.record.version)).toEqual([1]);
    expect(w.events.published.at(-2)).toBeInstanceOf(MailCopyPublishedEvent);
    expect(w.events.published.at(-1)).toEqual(new MailDocumentPublishedEvent(TEMPLATE, 1, null, 1));
    expect(w.cache.forgotten).toBe(1);
  });

  it("ne publie PAS les phrases en attente des autres e-mails", async () => {
    const w = world();
    await w.phrase.execute(
      new SaveMailCopyDraftCommand(TITLE.mail, TITLE.path, "fr", "Bonjour {firstName}", 0, STAFF),
    );
    await w.save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, REVERSED, 0, STAFF));
    await w.publish.execute(new PublishMailDocumentCommand(TEMPLATE, 1, STAFF));
    expect(w.texts.state(TITLE.mail, TITLE.path, "fr")).toMatchObject({
      draft: { state: "set" },
      publishedText: null,
    });
  });

  it("publie les phrases seules quand l'arrangement n'a pas de brouillon", async () => {
    const w = world();
    await w.phrase.execute(
      new SaveMailCopyDraftCommand(TEMPLATE, SUBJECT.path, "fr", "Merci {ref}", 0, STAFF),
    );
    expect(await w.publish.execute(new PublishMailDocumentCommand(TEMPLATE, 0, STAFF))).toBe(1);
    expect(w.documents.saves).toBe(0);
    expect(w.events.published).toHaveLength(1);
  });

  it("refuse quand rien n'attend pour cet e-mail, sans monter la version", async () => {
    const w = world();
    await expect(
      w.publish.execute(new PublishMailDocumentCommand(TEMPLATE, 0, STAFF)),
    ).rejects.toBeInstanceOf(NothingToPublishForMailError);
    expect(w.texts.version).toBe(0);
    expect(w.cache.forgotten).toBe(0);
  });

  /** Un encadré sans son anglais : rien ne part, ni l'arrangement, ni les phrases. */
  it("refuse un bloc libre incomplet, et ne publie alors aucune phrase", async () => {
    const w = world();
    await w.phrase.execute(
      new SaveMailCopyDraftCommand(TEMPLATE, SUBJECT.path, "fr", "Merci {ref}", 0, STAFF),
    );
    const incomplete: MailDocument = {
      template: TEMPLATE,
      blocks: [...STARTING.blocks, { id: "note", kind: "paragraph", text: { fr: "Fermé" } }],
    };
    await w.save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, incomplete, 0, STAFF));
    await expect(
      w.publish.execute(new PublishMailDocumentCommand(TEMPLATE, 1, STAFF)),
    ).rejects.toBeInstanceOf(MailDocumentRefusedError);
    expect(w.texts.version).toBe(0);
    expect(w.texts.state(TEMPLATE, SUBJECT.path, "fr")?.publishedText).toBeNull();
  });
});

describe("revenir au modèle d'origine", () => {
  it("retire le publié, fait monter la version pour les autres instances, journalise", async () => {
    const w = world();
    await w.save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, REVERSED, 0, STAFF));
    await w.publish.execute(new PublishMailDocumentCommand(TEMPLATE, 1, STAFF));

    expect(await w.revert.execute(new RevertMailDocumentCommand(TEMPLATE, 2, STAFF))).toBe(2);
    expect(w.documents.rows.get(TEMPLATE)).toMatchObject({ published: null, draft: null });
    expect(w.events.published.at(-1)).toEqual(new MailDocumentRetractedEvent(TEMPLATE, 1, 2));
    expect(w.cache.forgotten).toBe(2);
  });

  /** Les phrases n'ont jamais quitté le dictionnaire : leurs brouillons restent. */
  it("ne touche à aucune phrase, brouillon compris", async () => {
    const w = world();
    await w.save.execute(new SaveMailDocumentDraftCommand(TEMPLATE, REVERSED, 0, STAFF));
    await w.phrase.execute(
      new SaveMailCopyDraftCommand(TEMPLATE, SUBJECT.path, "fr", "Merci {ref}", 0, STAFF),
    );
    await w.revert.execute(new RevertMailDocumentCommand(TEMPLATE, 1, STAFF));
    expect(w.texts.state(TEMPLATE, SUBJECT.path, "fr")).toMatchObject({
      draft: { state: "set", text: "Merci {ref}" },
      publishedText: null,
    });
  });

  it("refuse un e-mail déjà à son arrangement d'origine", async () => {
    const w = world();
    await expect(
      w.revert.execute(new RevertMailDocumentCommand(TEMPLATE, 0, STAFF)),
    ).rejects.toBeInstanceOf(NothingToRevertError);
    expect(w.texts.version).toBe(0);
  });
});
