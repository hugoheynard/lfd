import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DEFAULT_ORDER,
  MANIFEST,
  QR_FIRST,
  stamp,
} from "../../domain/__tests__/mail-copy-fixtures.js";
import {
  InvalidMailSectionOrderError,
  MailSectionOrderChangedError,
} from "../../domain/mail-copy-errors.js";
import { mailCopyAdminView } from "../mail-copy-admin-view.js";
import { PublishMailCopyCommand } from "../commands/publish-mail-copy.command.js";
import { PublishMailCopyHandler } from "../commands/publish-mail-copy.handler.js";
import { ResetMailSectionOrderDraftCommand } from "../commands/reset-mail-section-order-draft.command.js";
import { ResetMailSectionOrderDraftHandler } from "../commands/reset-mail-section-order-draft.handler.js";
import { SaveMailSectionOrderDraftCommand } from "../commands/save-mail-section-order-draft.command.js";
import { SaveMailSectionOrderDraftHandler } from "../commands/save-mail-section-order-draft.handler.js";
import { SendMailCopyTrialCommand } from "../commands/send-mail-copy-trial.command.js";
import { SendMailCopyTrialHandler } from "../commands/send-mail-copy-trial.handler.js";
import { GetMailCopyPreviewHandler } from "../queries/get-mail-copy-preview.handler.js";
import { GetMailCopyPreviewQuery } from "../queries/get-mail-copy-preview.query.js";
import {
  FixedStaffContacts,
  InMemoryAdminReader,
  InMemoryMailCopy,
  InMemoryReleases,
  InMemorySectionOrders,
  RecordingCache,
  RecordingRenderer,
  RecordingTrialSender,
} from "./mail-copy-doubles.js";

const AT = new Date(0);
const STAFF = "fiche-colette";
const MAIL = "customer.order-placed";

function world() {
  const texts = new InMemoryMailCopy();
  const orders = new InMemorySectionOrders(texts);
  const reader = new InMemoryAdminReader(texts);
  const clock = new FixedClock(AT);
  const uow = new DirectUnitOfWork();
  const events = new RecordingPublisher();
  const cache = new RecordingCache();
  const renderer = new RecordingRenderer();
  const sender = new RecordingTrialSender();
  const contacts = new FixedStaffContacts([
    {
      staffUserId: STAFF,
      firstName: "C",
      lastName: "M",
      email: "c@lfc.test",
      jobTitle: "",
      active: true,
    },
  ]);
  return {
    texts,
    reader,
    events,
    cache,
    renderer,
    sender,
    save: new SaveMailSectionOrderDraftHandler(orders, MANIFEST, clock, uow),
    reset: new ResetMailSectionOrderDraftHandler(orders, clock, uow),
    publish: new PublishMailCopyHandler(
      new InMemoryReleases(texts),
      MANIFEST,
      cache,
      events,
      clock,
      uow,
    ),
    preview: new GetMailCopyPreviewHandler(reader, MANIFEST, renderer),
    trial: new SendMailCopyTrialHandler(reader, MANIFEST, contacts, sender, events, uow),
  };
}

const order = (sections: readonly string[], revision = 0): SaveMailSectionOrderDraftCommand =>
  new SaveMailSectionOrderDraftCommand(MAIL, sections, revision, STAFF);

describe("déplacer les sections d'un e-mail (E4, S2 et S3)", () => {
  it("pose l'ordre en brouillon, avec son auteur ; un second geste sur la même révision est refusé", async () => {
    const w = world();
    await w.save.execute(order(QR_FIRST));
    expect(w.texts.orders.get(MAIL)).toMatchObject({
      revision: 1,
      draft: { state: "set", order: [...QR_FIRST] },
      drafted: stamp(AT, STAFF),
    });
    await expect(w.save.execute(order(DEFAULT_ORDER))).rejects.toBeInstanceOf(
      MailSectionOrderChangedError,
    );
  });

  it("refuse un ordre qui oublie une section, sans rien écrire", async () => {
    const w = world();
    await expect(w.save.execute(order(["title", "body"]))).rejects.toBeInstanceOf(
      InvalidMailSectionOrderError,
    );
    expect(w.texts.orders.size).toBe(0);
  });

  it("« Publier » met l'ordre en service avec les textes, et le journal porte avant/après", async () => {
    const w = world();
    await w.save.execute(order(QR_FIRST));
    expect(await w.publish.execute(new PublishMailCopyCommand(STAFF))).toBe(1);
    expect(w.texts.orders.get(MAIL)).toMatchObject({
      draft: { state: "unchanged" },
      publishedOrder: [...QR_FIRST],
    });
    expect(w.events.traced[0]?.journalFact().payload).toMatchObject({
      changes: [],
      sectionOrders: [{ mail: MAIL, before: null, after: [...QR_FIRST] }],
    });
    expect(w.cache.forgotten).toBe(1);
  });

  it("« Rétablir » ne change rien avant « Publier », puis rend l'ordre du code", async () => {
    const w = world();
    await w.save.execute(order(QR_FIRST));
    await w.publish.execute(new PublishMailCopyCommand(STAFF));
    await w.reset.execute(new ResetMailSectionOrderDraftCommand(MAIL, 1, STAFF));
    expect(w.texts.orders.get(MAIL)?.publishedOrder).toEqual([...QR_FIRST]);
    await w.publish.execute(new PublishMailCopyCommand(STAFF));
    expect(w.texts.orders.get(MAIL)?.publishedOrder).toBeNull();
  });
});

describe("l'ordre dans l'aperçu, l'essai et l'écran", () => {
  it("l'aperçu et l'essai reçoivent l'ordre de la source demandée", async () => {
    const w = world();
    await w.save.execute(order(QR_FIRST));
    await w.preview.execute(new GetMailCopyPreviewQuery(MAIL, "fr", "draft"));
    await w.preview.execute(new GetMailCopyPreviewQuery(MAIL, "fr", "published"));
    await w.trial.execute(new SendMailCopyTrialCommand(MAIL, "fr", "draft", STAFF));
    expect(w.renderer.calls.map((call) => call.order)).toEqual([[...QR_FIRST], null]);
    expect(w.sender.sent.map((sent) => sent.order)).toEqual([[...QR_FIRST]]);
  });

  it("l'écran range les sections dans l'ordre du brouillon, avec leurs trois positions", async () => {
    const w = world();
    await w.save.execute(order(QR_FIRST));
    const view = mailCopyAdminView(
      MANIFEST,
      [],
      await w.reader.publication(),
      await w.reader.sectionOrders(),
    );
    const mail = view.mails.find((candidate) => candidate.mail === MAIL);
    expect(view.pendingCount).toBe(1);
    expect(mail?.pendingCount).toBe(1);
    expect(mail?.frames).toEqual({
      subject: [{ path: "subject", variant: null }],
      header: [{ path: "kicker", variant: null }],
    });
    expect(
      mail?.sections.map((s) => [
        s.id,
        s.nature,
        s.defaultPosition,
        s.publishedPosition,
        s.draftPosition,
      ]),
    ).toEqual([
      ["image", "system", 2, 2, 0],
      ["title", "text", 0, 0, 1],
      ["body", "text", 1, 1, 2],
      ["footer", "text", 3, 3, 3],
    ]);
    expect(mail?.sections[1]?.texts).toEqual([
      { path: "title.paid", variant: "Commande payée par carte" },
      { path: "title.due", variant: "Commande à régler" },
    ]);
    expect(mail?.sectionOrder).toEqual({
      draftState: "set",
      revision: 1,
      default: [...DEFAULT_ORDER],
      published: null,
      draft: [...QR_FIRST],
      draftAt: AT.toISOString(),
      draftBy: STAFF,
    });
  });
});
