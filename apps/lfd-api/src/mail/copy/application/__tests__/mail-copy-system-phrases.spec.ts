import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  KICKER,
  MANIFEST,
  ORDER_PLACED_LAYOUT,
  SUBJECT,
  TITLE,
} from "../../domain/__tests__/mail-copy-fixtures.js";
import { MailSystemPhraseError } from "../../domain/mail-copy-errors.js";
import { MailCopyManifest } from "../../domain/mail-copy-manifest.js";
import { PublishMailCopyCommand } from "../commands/publish-mail-copy.command.js";
import { PublishMailCopyHandler } from "../commands/publish-mail-copy.handler.js";
import { ResetMailCopyDraftCommand } from "../commands/reset-mail-copy-draft.command.js";
import { ResetMailCopyDraftHandler } from "../commands/reset-mail-copy-draft.handler.js";
import { SaveMailCopyDraftCommand } from "../commands/save-mail-copy-draft.command.js";
import { SaveMailCopyDraftHandler } from "../commands/save-mail-copy-draft.handler.js";
import { mailCopyAdminView } from "../mail-copy-admin-view.js";
import {
  InMemoryAdminReader,
  InMemoryMailCopy,
  InMemoryReleases,
  RecordingCache,
} from "./mail-copy-doubles.js";

const AT = new Date(0);
const STAFF = "fiche-colette";

/** « Commande passée » ne laisse réécrire que son objet ; « Société rattachée » n'a pas de liste. */
const BOUNDED = MailCopyManifest.of(
  [SUBJECT, KICKER, TITLE],
  [
    {
      mail: "customer.order-placed",
      family: "order",
      followsLocale: true,
      editablePhrases: ["subject"],
    },
    { mail: "customer.company-attached", family: "account", followsLocale: false },
  ],
  [ORDER_PLACED_LAYOUT],
);

function world(manifest: MailCopyManifest, texts = new InMemoryMailCopy()) {
  const clock = new FixedClock(AT);
  const uow = new DirectUnitOfWork();
  return {
    texts,
    draft: new SaveMailCopyDraftHandler(texts, manifest, clock, uow),
    reset: new ResetMailCopyDraftHandler(texts, manifest, clock, uow),
    publish: new PublishMailCopyHandler(
      new InMemoryReleases(texts),
      manifest,
      new RecordingCache(),
      new RecordingPublisher(),
      clock,
      uow,
    ),
  };
}

const kickerDraft = (revision = 0): SaveMailCopyDraftCommand =>
  new SaveMailCopyDraftCommand(KICKER.mail, KICKER.path, "fr", "Validée", revision, STAFF);

/** § 23 : l'éditeur cachait les libellés système, la route d'écriture les acceptait encore. */
describe("un libellé système (§ 23, editablePhrases)", () => {
  it("refuse nommément de l'écrire en brouillon, sans rien écrire", async () => {
    const w = world(BOUNDED);
    const refusal = w.draft.execute(kickerDraft());
    await expect(refusal).rejects.toBeInstanceOf(MailSystemPhraseError);
    await expect(w.draft.execute(kickerDraft())).rejects.toThrow(
      /« kicker » de l'e-mail « customer\.order-placed » est un libellé système.*équipe technique/u,
    );
    expect(w.texts.rows.size).toBe(0);
  });

  it("écrit toujours une phrase éditable du même e-mail", async () => {
    const w = world(BOUNDED);
    await w.draft.execute(
      new SaveMailCopyDraftCommand(SUBJECT.mail, SUBJECT.path, "fr", "Merci {ref}", 0, STAFF),
    );
    expect(w.texts.state(SUBJECT.mail, SUBJECT.path, "fr")?.draft).toEqual({
      state: "set",
      text: "Merci {ref}",
    });
  });

  it("un e-mail sans liste accepte tous ses textes, comme avant", async () => {
    const w = world(BOUNDED);
    await w.draft.execute(
      new SaveMailCopyDraftCommand(TITLE.mail, TITLE.path, "fr", "Bonjour à vous,", 0, STAFF),
    );
    expect(w.texts.rows.size).toBe(1);
  });

  it("se rétablit : le brouillon « rétablir » part à la publication", async () => {
    const texts = new InMemoryMailCopy();
    const before = world(MANIFEST, texts);
    await before.draft.execute(kickerDraft());
    await before.publish.execute(new PublishMailCopyCommand(STAFF));

    const after = world(BOUNDED, texts);
    await after.reset.execute(
      new ResetMailCopyDraftCommand(KICKER.mail, KICKER.path, "fr", 1, STAFF),
    );
    await after.publish.execute(new PublishMailCopyCommand(STAFF));
    expect(texts.state(KICKER.mail, KICKER.path, "fr")?.publishedText).toBeNull();
  });

  it("un brouillon posé avant la règle n'est ni publié ni effacé", async () => {
    const texts = new InMemoryMailCopy();
    await world(MANIFEST, texts).draft.execute(kickerDraft());

    const after = world(BOUNDED, texts);
    await after.draft.execute(
      new SaveMailCopyDraftCommand(SUBJECT.mail, SUBJECT.path, "fr", "Merci {ref}", 0, STAFF),
    );
    await after.publish.execute(new PublishMailCopyCommand(STAFF));
    expect(texts.state(KICKER.mail, KICKER.path, "fr")).toMatchObject({
      publishedText: null,
      draft: { state: "set", text: "Validée" },
    });
    expect(texts.state(SUBJECT.mail, SUBJECT.path, "fr")?.publishedText).toBe("Merci {ref}");
  });

  /**
   * Régression : « Publier » répondait « rien à publier » sous un compte
   * « 1 changement » quand le seul brouillon était un libellé système
   * (constaté au bâti du refus, 2026-11-07).
   */
  it("le compte « à publier » ignore un brouillon de libellé système", async () => {
    const texts = new InMemoryMailCopy();
    await world(MANIFEST, texts).draft.execute(kickerDraft());
    const reader = new InMemoryAdminReader(texts);

    const view = mailCopyAdminView(BOUNDED, await reader.entries(), await reader.publication());

    expect(view.pendingCount).toBe(0);
  });
});
