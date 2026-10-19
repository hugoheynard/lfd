import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  VitrineNoticeNoRecipientError,
  VitrineNoticeRecipientWithoutContactError,
} from "../../../domain/errors/vitrine-notice-errors.js";
import {
  type RenderedVitrineNotice,
  VitrineNoticeMailRenderer,
} from "../../../domain/ports/vitrine-notice-mail.renderer.js";
import type { VitrineNoticeText } from "../../../domain/vitrine-notice-text.js";
import { AT } from "../../../domain/__tests__/vitrine-fixtures.js";
import { PreviewVitrineNoticeQuery } from "../../queries/preview-vitrine-notice.query.js";
import { PreviewVitrineNoticeHandler } from "../../queries/preview-vitrine-notice.handler.js";
import { VitrineNoticeDispatcher } from "../../services/vitrine-notice-dispatcher.js";
import { SendVitrineNoticeCommand } from "../send-vitrine-notice.command.js";
import { SendVitrineNoticeHandler } from "../send-vitrine-notice.handler.js";
import { MemoryNotices, RecordingMailer, StaticReader } from "./vitrine-notice-doubles.js";

const KEY = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
class EchoRenderer extends VitrineNoticeMailRenderer {
  render(text: VitrineNoticeText): RenderedVitrineNotice {
    return { subject: text.subject, html: `<p>${text.message}</p>` };
  }
}

function setup(mailer = new RecordingMailer()) {
  const notices = new MemoryNotices();
  const clock = new FixedClock(AT);
  const handler = new SendVitrineNoticeHandler(
    notices,
    new StaticReader(),
    new VitrineNoticeDispatcher(notices, mailer, clock),
    new FixedIdGenerator("notice"),
    clock,
  );
  return { notices, handler, mailer };
}

const send = (ids: readonly string[] | null = null, key = KEY): SendVitrineNoticeCommand =>
  new SendVitrineNoticeCommand("staff-1", " Nouveau catalogue ", "Bonjour,\nà vous.", ids, key);

describe("SendVitrineNoticeHandler", () => {
  it("écrit un e-mail par contact, coupé compris, et consigne l'acceptation", async () => {
    const { notices, handler, mailer } = setup();
    const id = await handler.execute(send());
    expect(id).toBe("notice_000001");
    expect(mailer.sent.map((m) => m.to)).toEqual(["web@agence.fr", "coupee@agence.fr"]);
    expect(mailer.sent[0]).toMatchObject({
      template: "agency.vitrine-notice",
      data: { subject: "Nouveau catalogue", message: "Bonjour,\nà vous." },
      idempotencyKey: "vitrine-notice:notice_000001:s1",
    });
    const row = notices.rows.get(id);
    expect(row?.authorStaffId).toBe("staff-1");
    expect(row?.recipients.map((r) => r.mailSent)).toEqual([true, true]);
  });

  it("un double clic rend la même annonce et n'envoie rien de plus", async () => {
    const { handler, mailer } = setup();
    const first = await handler.execute(send());
    const second = await handler.execute(send());
    expect(second).toBe(first);
    expect(mailer.sent).toHaveLength(2);
  });

  it("deux clics simultanés : le perdant de la course n'envoie rien", async () => {
    const { notices, handler, mailer } = setup();
    notices.raceWinner = "notice_premier";
    expect(await handler.execute(send())).toBe("notice_premier");
    expect(mailer.sent).toHaveLength(0);
  });

  it("un refus du fournisseur est consigné « non envoyé » et n'arrête pas les autres", async () => {
    const mailer = new RecordingMailer();
    mailer.refused.add("web@agence.fr");
    const { notices, handler } = setup(mailer);
    const id = await handler.execute(send());
    expect(notices.rows.get(id)?.recipients.map((r) => r.mailSent)).toEqual([false, true]);
  });

  it("à blanc, rien n'est prétendu accepté", async () => {
    const { notices, handler } = setup(new RecordingMailer(false));
    const id = await handler.execute(send(["s1"]));
    expect(notices.rows.get(id)?.recipients).toMatchObject([{ mailSent: false }]);
  });

  it("refuse un abonné sans contact, et n'écrit ni n'envoie rien", async () => {
    const { notices, handler, mailer } = setup();
    await expect(handler.execute(send(["s1", "s2"]))).rejects.toThrow(
      VitrineNoticeRecipientWithoutContactError,
    );
    expect(notices.rows.size).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("PreviewVitrineNoticeHandler", () => {
  const preview = new PreviewVitrineNoticeHandler(new StaticReader(), new EchoRenderer());

  it("rend l'e-mail par le gabarit et la liste des adresses", async () => {
    const view = await preview.execute(new PreviewVitrineNoticeQuery("Objet", " Texte ", null));
    expect(view).toEqual({
      subject: "Objet",
      html: "<p>Texte</p>",
      recipients: [
        { subscriberId: "s1", name: "Agence", contactEmail: "web@agence.fr" },
        { subscriberId: "s3", name: "Coupée", contactEmail: "coupee@agence.fr" },
      ],
    });
  });

  it("refuse comme l'envoi refuserait", async () => {
    await expect(
      preview.execute(new PreviewVitrineNoticeQuery("Objet", "Texte", [])),
    ).rejects.toThrow(VitrineNoticeNoRecipientError);
  });
});
