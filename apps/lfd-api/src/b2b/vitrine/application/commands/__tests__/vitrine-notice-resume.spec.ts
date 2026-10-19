import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  VitrineNoticeNotFoundError,
  VitrineNoticeNothingToResumeError,
} from "../../../domain/errors/vitrine-notice-errors.js";
import type { VitrineNoticeEntry } from "../../../domain/ports/vitrine-notice.reader.js";
import { AT } from "../../../domain/__tests__/vitrine-fixtures.js";
import { ListVitrineNoticesHandler } from "../../queries/list-vitrine-notices.handler.js";
import { VitrineNoticeDispatcher } from "../../services/vitrine-notice-dispatcher.js";
import { ResumeVitrineNoticeCommand } from "../resume-vitrine-notice.command.js";
import { ResumeVitrineNoticeHandler } from "../resume-vitrine-notice.handler.js";
import { SendVitrineNoticeCommand } from "../send-vitrine-notice.command.js";
import { SendVitrineNoticeHandler } from "../send-vitrine-notice.handler.js";
import { MemoryNotices, RecordingMailer, StaticReader } from "./vitrine-notice-doubles.js";

const KEY = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/** Une annonce envoyée à s1 et s3, puis « interrompue » : s3 remis à « pas tenté ». */
async function interrupted(mailer = new RecordingMailer()) {
  const notices = new MemoryNotices();
  const clock = new FixedClock(AT);
  const dispatcher = new VitrineNoticeDispatcher(notices, mailer, clock);
  const id = await new SendVitrineNoticeHandler(
    notices,
    new StaticReader(),
    dispatcher,
    new FixedIdGenerator("notice"),
    clock,
  ).execute(new SendVitrineNoticeCommand("staff-1", "Objet", "Texte", null, KEY));
  const row = notices.rows.get(id);
  if (row === undefined) {
    throw new Error("annonce non rangée");
  }
  notices.rows.set(id, {
    ...row,
    recipients: row.recipients.map((r) =>
      r.subscriberId === "s3" ? { ...r, mailSent: null, attemptedAt: null } : r,
    ),
  });
  mailer.sent.splice(0);
  return { id, notices, mailer, resume: new ResumeVitrineNoticeHandler(notices, dispatcher) };
}

describe("ResumeVitrineNoticeHandler", () => {
  /**
   * Régression (2026-10-19) : une annonce coupée au milieu laissait des
   * destinataires « pas tentés », et aucun geste ne les relançait.
   */
  it("n'écrit qu'aux destinataires pas tentés, avec la même clé Resend", async () => {
    const { id, notices, mailer, resume } = await interrupted();
    await resume.execute(new ResumeVitrineNoticeCommand(id));

    expect(mailer.sent.map((m) => m.to)).toEqual(["coupee@agence.fr"]);
    expect(mailer.sent[0]?.idempotencyKey).toBe(`vitrine-notice:${id}:s3`);
    expect(notices.rows.get(id)?.recipients.map((r) => r.mailSent)).toEqual([true, true]);
  });

  it("refuse quand il ne reste personne, sans rien envoyer", async () => {
    const { id, mailer, resume } = await interrupted();
    await resume.execute(new ResumeVitrineNoticeCommand(id));
    mailer.sent.splice(0);

    await expect(resume.execute(new ResumeVitrineNoticeCommand(id))).rejects.toThrow(
      VitrineNoticeNothingToResumeError,
    );
    expect(mailer.sent).toHaveLength(0);
  });

  it("ne reprend pas un destinataire refusé : son issue reste au journal", async () => {
    const mailer = new RecordingMailer();
    mailer.refused.add("web@agence.fr");
    const { id, notices, resume } = await interrupted(mailer);
    mailer.refused.clear();
    await resume.execute(new ResumeVitrineNoticeCommand(id));

    expect(mailer.sent.map((m) => m.to)).toEqual(["coupee@agence.fr"]);
    expect(notices.rows.get(id)?.recipients.map((r) => r.mailSent)).toEqual([false, true]);
  });

  it("une annonce inconnue est introuvable", async () => {
    const { resume } = await interrupted();
    await expect(resume.execute(new ResumeVitrineNoticeCommand("absente"))).rejects.toThrow(
      VitrineNoticeNotFoundError,
    );
  });
});

describe("ListVitrineNoticesHandler", () => {
  const entry = (id: string, authorStaffId: string): VitrineNoticeEntry => ({
    id,
    authorStaffId,
    subject: "Objet",
    message: "Texte",
    createdAt: AT.toISOString(),
    recipients: [],
  });

  it("nomme l'auteur par l'annuaire, en une lecture, et rend null pour un id inconnu", async () => {
    const authors = new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Inès", lastName: "Boutique" }, "staff_1"),
    );
    const views = await new ListVitrineNoticesHandler(
      new StaticReader([entry("n1", "staff_1"), entry("n2", "staff_parti")]),
      authors,
    ).execute();

    expect(authors.asked).toHaveLength(1);
    expect(views.map((view) => [view.authorStaffId, view.authorName])).toEqual([
      ["staff_1", "Inès Boutique"],
      ["staff_parti", null],
    ]);
  });
});
