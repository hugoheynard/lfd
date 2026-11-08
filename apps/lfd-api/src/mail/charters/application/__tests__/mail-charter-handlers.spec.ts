import type { MailCharterSettings } from "@lfd/mail-blocks";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  InMemoryMailCopy,
  InMemoryReleases,
  RecordingCache,
} from "../../../copy/application/__tests__/mail-copy-doubles.js";
import {
  MailImageOriginNotAdmittedError,
  MailImageStorageUnavailableError,
} from "../../../images/domain/errors/mail-image.errors.js";
import {
  MailCharterLogoRefusedError,
  MailCharterLogoUnavailableError,
  MailCharterRefusedError,
  NothingToPublishForCharterError,
  UnknownMailSpaceError,
} from "../../domain/mail-charter-errors.js";
import { PublishMailCharterCommand } from "../commands/publish-mail-charter.command.js";
import { PublishMailCharterHandler } from "../commands/publish-mail-charter.handler.js";
import { SaveMailCharterDraftCommand } from "../commands/save-mail-charter-draft.command.js";
import { SaveMailCharterDraftHandler } from "../commands/save-mail-charter-draft.handler.js";
import {
  FixedSpaceDirectory,
  InMemoryMailCharters,
  LFD_SETTINGS,
  RecordingCharterLogo,
  STARTING_SETTINGS,
} from "./mail-charter-doubles.js";

const STAFF = "fiche-colette";

/** Une unité de travail qui sait si un travail est en cours. */
class WatchedUnitOfWork extends DirectUnitOfWork {
  inside = false;

  override async run<T>(work: () => Promise<T>): Promise<T> {
    this.inside = true;
    try {
      return await work();
    } finally {
      this.inside = false;
    }
  }
}

/** La copie du logo doublée, qui note si elle a été appelée dans la transaction. */
class WatchedLogo extends RecordingCharterLogo {
  readonly insideAtCopy: boolean[] = [];

  constructor(
    private readonly uow: WatchedUnitOfWork,
    refusal: Error | null,
  ) {
    super(refusal);
  }

  override copy(sourceUrl: string): Promise<string> {
    this.insideAtCopy.push(this.uow.inside);
    return super.copy(sourceUrl);
  }
}

function world(refusal: Error | null = null) {
  const charters = new InMemoryMailCharters();
  const texts = new InMemoryMailCopy();
  const events = new RecordingPublisher();
  const clock = new FixedClock(new Date(0));
  const uow = new WatchedUnitOfWork();
  const logo = new WatchedLogo(uow, refusal);
  const cache = new RecordingCache();
  const save = new SaveMailCharterDraftHandler(charters, events, clock, uow);
  const publish = new PublishMailCharterHandler(
    charters,
    new InMemoryReleases(texts),
    new FixedSpaceDirectory(),
    logo,
    cache,
    events,
    clock,
    uow,
  );
  return {
    charters,
    texts,
    events,
    logo,
    cache,
    draft: (settings: MailCharterSettings, space = "lfd", revision = 0) =>
      save.execute(new SaveMailCharterDraftCommand(space, settings, revision, STAFF)),
    publish: (space = "lfd", revision = 1) =>
      publish.execute(new PublishMailCharterCommand(space, revision, STAFF)),
  };
}

describe("enregistrer le brouillon d'une charte", () => {
  it("écrit le brouillon et le journalise", async () => {
    const w = world();
    await w.draft(LFD_SETTINGS);
    expect(w.charters.rows.get("lfd")?.draft?.settings).toEqual(LFD_SETTINGS);
    expect(w.events.traced.map((event) => event.journalFact())).toEqual([
      expect.objectContaining({
        type: "mail_copy.charter_saved",
        subjectId: "lfd",
        payload: { subjectLabel: "La Folie Douce — équipe", space: "lfd", revision: 1 },
      }),
    ]);
  });

  it("refuse un espace qui n'existe pas, `internal` compris", async () => {
    await expect(world().draft(LFD_SETTINGS, "internal")).rejects.toBeInstanceOf(
      UnknownMailSpaceError,
    );
  });
});

describe("publier la charte d'un espace", () => {
  it("copie le logo hors transaction, publie la copie et fait monter la version des textes", async () => {
    const w = world();
    await w.draft(LFD_SETTINGS);

    const publication = await w.publish();

    expect(publication).toEqual({ version: 1, publicationVersion: 1 });
    expect(w.logo.calls).toEqual(["https://media.lfd.test/logo-lfd.png"]);
    expect(w.logo.insideAtCopy).toEqual([false]);
    expect(w.charters.rows.get("lfd")?.published?.settings.logo?.src).toBe(
      `${RecordingCharterLogo.COPY_BASE}logo-lfd.png`,
    );
    expect(w.texts.version).toBe(1);
    expect(w.cache.forgotten).toBe(1);
    expect(w.events.factTypes()).toEqual([
      "mail_copy.charter_saved",
      "mail_copy.charter_published",
    ]);
  });

  it("garde le logo embarqué sans rien copier", async () => {
    const w = world();
    await w.draft(STARTING_SETTINGS);
    await w.publish();
    expect(w.logo.calls).toEqual([]);
    expect(w.charters.rows.get("lfd")?.published?.settings.logo).toBeNull();
  });

  it("refuse sans brouillon", async () => {
    await expect(world().publish("lfd", 0)).rejects.toBeInstanceOf(NothingToPublishForCharterError);
  });

  it("un brouillon refusé l'est avant toute copie", async () => {
    const w = world();
    await w.draft({ ...LFD_SETTINGS, logo: { src: LFD_SETTINGS.logo?.src ?? "", alt: {} } });
    await expect(w.publish()).rejects.toBeInstanceOf(MailCharterRefusedError);
    expect(w.logo.calls).toEqual([]);
  });

  it("un logo refusé par la copie refuse la publication, et rien n'est publié", async () => {
    const w = world(new MailImageOriginNotAdmittedError("https://media.lfd.test"));
    await w.draft(LFD_SETTINGS);
    await expect(w.publish()).rejects.toBeInstanceOf(MailCharterLogoRefusedError);
    expect(w.charters.rows.get("lfd")?.published).toBeNull();
    expect(w.texts.version).toBe(0);
  });

  it("un stockage en panne est une erreur technique", async () => {
    const w = world(new MailImageStorageUnavailableError("R2_MEDIA_* manquants"));
    await w.draft(LFD_SETTINGS);
    await expect(w.publish()).rejects.toBeInstanceOf(MailCharterLogoUnavailableError);
  });

  it("ne touche pas l'autre espace", async () => {
    const w = world();
    await w.draft(LFD_SETTINGS);
    await w.publish();
    expect(w.charters.rows.get("lfc")).toBeUndefined();
  });
});
