import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import type { AppConfig } from "../../../../platform/config/app-config.js";
import { RecordingJournal } from "../../../../platform/journal/__tests__/recording-journal.js";
import type { B2bMails } from "../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { STAFF_FACTS } from "../../domain/staff-facts.js";
import type { StaffUserSnapshot } from "../../domain/staff-user-state.js";
import { SetStaffStatusCommand } from "../set-staff-status.command.js";
import { SetStaffStatusHandler } from "../set-staff-status.handler.js";
import {
  CECILE,
  RecordingAccessCache,
  ScriptedStaffUsers,
  TrackingUnitOfWork,
} from "./staff-doubles.js";

function harness(before: StaffUserSnapshot, journalDown = false) {
  const uow = new TrackingUnitOfWork();
  const staff = new ScriptedStaffUsers(uow, before);
  const journal = new RecordingJournal(journalDown ? new Error("journal en panne") : null);
  const cache = new RecordingAccessCache(uow);
  const mails: string[] = [];
  const mailer: Pick<B2bMailer, "enabled" | "send"> = {
    enabled: true,
    send: <K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> => {
      mails.push(String(args.template));
      return Promise.resolve({ providerId: null });
    },
  };
  const config = { adminBaseUrl: (): string => "https://admin.test" } as AppConfig;
  const handler = new SetStaffStatusHandler(staff, config, mailer, journal, uow, cache);
  return { handler, journal, cache, mails };
}

const suspend = new SetStaffStatusCommand("s1", { status: "suspended" }, "staff_moi");

describe("SetStaffStatusHandler — la porte se ferme avec sa trace", () => {
  it("suspend : un fait, le cache oublié APRÈS le commit, puis l'e-mail", async () => {
    const h = harness(CECILE);

    await h.handler.execute(suspend);

    expect(h.journal.facts).toEqual([
      {
        type: STAFF_FACTS.suspended,
        subjectType: "staff_user",
        subjectId: "s1",
        payload: { person: { firstName: "Cécile", lastName: "Martin" } },
      },
    ]);
    expect(h.cache.forgotten).toEqual([{ insideTransaction: false }]);
    expect(h.mails).toEqual(["staff.access-suspended"]);
  });

  it("réintègre une personne suspendue", async () => {
    const h = harness({ ...CECILE, status: "suspended" });

    await h.handler.execute(new SetStaffStatusCommand("s1", { status: "active" }, "staff_moi"));

    expect(h.journal.types()).toEqual([STAFF_FACTS.reinstated]);
    expect(h.mails).toEqual(["staff.access-restored"]);
  });

  it("n'écrit aucun fait quand l'état ne bouge pas", async () => {
    const h = harness({ ...CECILE, status: "suspended" });

    await h.handler.execute(suspend);

    expect(h.journal.facts).toEqual([]);
  });

  it("n'envoie rien et n'oublie rien quand le journal tombe", async () => {
    const h = harness(CECILE, true);

    await expect(h.handler.execute(suspend)).rejects.toThrow("journal en panne");
    expect(h.mails).toEqual([]);
    expect(h.cache.forgotten).toEqual([]);
  });
});
