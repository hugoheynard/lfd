import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { KICKER, MANIFEST, SUBJECT, TITLE } from "../../domain/__tests__/mail-copy-fixtures.js";
import { MailCopyManifest } from "../../domain/mail-copy-manifest.js";
import { PublishMailCopyCommand } from "../commands/publish-mail-copy.command.js";
import { PublishMailCopyHandler } from "../commands/publish-mail-copy.handler.js";
import { ResetMailCopyDraftCommand } from "../commands/reset-mail-copy-draft.command.js";
import { ResetMailCopyDraftHandler } from "../commands/reset-mail-copy-draft.handler.js";
import { SaveMailCopyDraftCommand } from "../commands/save-mail-copy-draft.command.js";
import { SaveMailCopyDraftHandler } from "../commands/save-mail-copy-draft.handler.js";
import { GetMailCopyAdminHandler } from "../queries/get-mail-copy-admin.handler.js";
import {
  InMemoryAdminReader,
  InMemoryMailCopy,
  InMemoryReleases,
  RecordingCache,
} from "./mail-copy-doubles.js";

const AT = new Date(0);
const STAFF = "fiche-colette";

/** Le code d'après : le texte français de l'objet a été réécrit. */
const REWRITTEN = MailCopyManifest.of(
  [
    { ...SUBJECT, defaults: { ...SUBJECT.defaults, fr: "Commande {ref} confirmée" } },
    KICKER,
    TITLE,
  ],
  MANIFEST.mails(),
);

/** Deux déploiements sur la même base : celui où l'on a modifié, celui d'après. */
function world() {
  const texts = new InMemoryMailCopy();
  const clock = new FixedClock(AT);
  const uow = new DirectUnitOfWork();
  const publisher = (manifest: MailCopyManifest): PublishMailCopyHandler =>
    new PublishMailCopyHandler(
      new InMemoryReleases(texts),
      manifest,
      new RecordingCache(),
      new RecordingPublisher(),
      clock,
      uow,
    );
  return {
    draft: (manifest: MailCopyManifest, revision: number) =>
      new SaveMailCopyDraftHandler(texts, manifest, clock, uow).execute(
        new SaveMailCopyDraftCommand(
          SUBJECT.mail,
          SUBJECT.path,
          "fr",
          "Merci {ref}",
          revision,
          STAFF,
        ),
      ),
    reset: (revision: number) =>
      new ResetMailCopyDraftHandler(texts, clock, uow).execute(
        new ResetMailCopyDraftCommand(SUBJECT.mail, SUBJECT.path, "fr", revision, STAFF),
      ),
    publish: (manifest: MailCopyManifest) =>
      publisher(manifest).execute(new PublishMailCopyCommand(STAFF)),
    view: async () => {
      const view = await new GetMailCopyAdminHandler(
        new InMemoryAdminReader(texts),
        REWRITTEN,
      ).execute();
      return {
        count: view.defaultChangedCount,
        fr: view.mails[0]?.texts[0]?.locales.fr.defaultChangedSince ?? null,
      };
    },
  };
}

describe("le texte d'origine changé depuis la modification", () => {
  it("apparaît sur un texte publié quand le code l'a réécrit, et « Rétablir » le retire", async () => {
    const w = world();
    await w.draft(MANIFEST, 0);
    await w.publish(MANIFEST);
    expect(await w.view()).toEqual({
      count: 1,
      fr: { previousDefault: SUBJECT.defaults.fr },
    });

    await w.reset(1);
    expect(await w.view()).toEqual({ count: 0, fr: null });
  });

  it("disparaît quand on republie après relecture : le nouveau texte du code est noté", async () => {
    const w = world();
    await w.draft(MANIFEST, 0);
    expect((await w.view()).count).toBe(1);
    await w.publish(REWRITTEN);
    expect(await w.view()).toEqual({ count: 0, fr: null });
  });
});
