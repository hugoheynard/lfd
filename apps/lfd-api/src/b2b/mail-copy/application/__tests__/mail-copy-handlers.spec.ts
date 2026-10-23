import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { KICKER, MANIFEST, SUBJECT } from "../../domain/__tests__/mail-copy-fixtures.js";
import {
  InvalidMailTextError,
  MailCopyChangedError,
  MailCopyPublishedMeanwhileError,
  NothingToPublishError,
  UnknownMailTextError,
} from "../../domain/mail-copy-errors.js";
import { MailCopyPublishedEvent } from "../../domain/mail-copy.events.js";
import { PublishMailCopyCommand } from "../commands/publish-mail-copy.command.js";
import { PublishMailCopyHandler } from "../commands/publish-mail-copy.handler.js";
import { ResetMailCopyDraftCommand } from "../commands/reset-mail-copy-draft.command.js";
import { ResetMailCopyDraftHandler } from "../commands/reset-mail-copy-draft.handler.js";
import { SaveMailCopyDraftCommand } from "../commands/save-mail-copy-draft.command.js";
import { SaveMailCopyDraftHandler } from "../commands/save-mail-copy-draft.handler.js";
import { InMemoryMailCopy, InMemoryReleases, RecordingCache } from "./mail-copy-doubles.js";

const AT = new Date(0);
const STAFF = "fiche-colette";

function world() {
  const texts = new InMemoryMailCopy();
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
    draft: new SaveMailCopyDraftHandler(texts, MANIFEST, clock, uow),
    reset: new ResetMailCopyDraftHandler(texts, clock, uow),
    publish: new PublishMailCopyHandler(releases, MANIFEST, cache, events, clock, uow),
  };
}

function draftOf(text: string, revision = 0, locale: "fr" | "en" = "fr"): SaveMailCopyDraftCommand {
  return new SaveMailCopyDraftCommand(SUBJECT.mail, SUBJECT.path, locale, text, revision, STAFF);
}

describe("écrire le brouillon d'un texte d'e-mail", () => {
  it("pose le texte, l'auteur et l'instant", async () => {
    const w = world();
    await w.draft.execute(draftOf("Merci pour {ref}"));
    expect(w.texts.state(SUBJECT.mail, SUBJECT.path, "fr")).toMatchObject({
      revision: 1,
      draft: { state: "set", text: "Merci pour {ref}" },
      drafted: { at: AT, staffId: STAFF },
    });
  });

  it("refuse en 409 l'écran qui a lu une révision dépassée", async () => {
    const w = world();
    await w.draft.execute(draftOf("Merci {ref}"));
    await expect(w.draft.execute(draftOf("Autre {ref}"))).rejects.toBeInstanceOf(
      MailCopyChangedError,
    );
  });

  it("refuse un texte inconnu et une variable perdue, sans rien écrire", async () => {
    const w = world();
    await expect(
      w.draft.execute(
        new SaveMailCopyDraftCommand(SUBJECT.mail, "pas.un.texte", "fr", "x", 0, STAFF),
      ),
    ).rejects.toBeInstanceOf(UnknownMailTextError);
    await expect(w.draft.execute(draftOf("Votre commande"))).rejects.toBeInstanceOf(
      InvalidMailTextError,
    );
    expect(w.texts.rows.size).toBe(0);
  });
});

describe("publier les textes des e-mails", () => {
  it("applique tous les brouillons, monte la version, journalise avant/après, oublie le cache", async () => {
    const w = world();
    await w.draft.execute(draftOf("Merci {ref}"));
    await w.draft.execute(
      new SaveMailCopyDraftCommand(KICKER.mail, KICKER.path, "en", "Done", 0, STAFF),
    );

    expect(await w.publish.execute(new PublishMailCopyCommand(STAFF))).toBe(1);

    expect(w.texts.version).toBe(1);
    expect(w.texts.state(SUBJECT.mail, SUBJECT.path, "fr")).toMatchObject({
      draft: { state: "unchanged" },
      publishedText: "Merci {ref}",
      published: { at: AT, staffId: STAFF },
    });
    expect(w.events.factTypes()).toEqual(["mail_copy.published"]);
    const [event] = w.events.traced;
    expect(event).toBeInstanceOf(MailCopyPublishedEvent);
    expect(event?.journalFact()).toMatchObject({ subjectType: "mail_copy", subjectId: "mail" });
    expect(event?.journalFact().payload).toEqual({
      subjectLabel: "Textes des e-mails",
      version: 1,
      changes: [
        {
          mail: SUBJECT.mail,
          path: SUBJECT.path,
          locale: "fr",
          before: null,
          after: "Merci {ref}",
        },
        { mail: KICKER.mail, path: KICKER.path, locale: "en", before: null, after: "Done" },
      ],
    });
    expect(w.cache.forgotten).toBe(1);
  });

  it("« rétablir » ne change rien avant « Publier », puis retire le texte publié", async () => {
    const w = world();
    await w.draft.execute(draftOf("Merci {ref}"));
    await w.publish.execute(new PublishMailCopyCommand(STAFF));
    await w.reset.execute(
      new ResetMailCopyDraftCommand(SUBJECT.mail, SUBJECT.path, "fr", 1, STAFF),
    );

    expect(w.texts.state(SUBJECT.mail, SUBJECT.path, "fr")?.publishedText).toBe("Merci {ref}");
    expect(await w.publish.execute(new PublishMailCopyCommand(STAFF))).toBe(2);
    expect(w.texts.state(SUBJECT.mail, SUBJECT.path, "fr")?.publishedText).toBeNull();
    expect(w.events.traced[1]?.journalFact().payload).toMatchObject({
      version: 2,
      changes: [{ before: "Merci {ref}", after: null }],
    });
  });

  it("refuse sans brouillon, sans fait ni oubli du cache", async () => {
    const w = world();
    await expect(w.publish.execute(new PublishMailCopyCommand(STAFF))).rejects.toBeInstanceOf(
      NothingToPublishError,
    );
    expect(w.events.traced).toHaveLength(0);
    expect(w.cache.forgotten).toBe(0);
  });

  it("une publication concurrente refuse la seconde, qui garde le cache", async () => {
    const w = world();
    await w.draft.execute(draftOf("Merci {ref}"));
    w.releases.raceVersion = true;
    await expect(w.publish.execute(new PublishMailCopyCommand(STAFF))).rejects.toBeInstanceOf(
      MailCopyPublishedMeanwhileError,
    );
    expect(w.cache.forgotten).toBe(0);
  });
});
