import { randomUUID } from "node:crypto";

import { PAY_LINK_TEST_DAILY_LIMIT } from "@lfd/contracts";

import { OpenableUnitOfWork } from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { RecordingStaffMemberMail } from "../../../../../mail/channels/requests/__tests__/recording-staff-member-mail.js";
import { StaffMemberUnreachableError } from "../../../../../mail/channels/requests/staff-member-mail.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { PayLinkTestDailyLimitError } from "../../domain/errors/pay-link-test-errors.js";
import { SendPayLinkTestCommand } from "../commands/send-pay-link-test.command.js";
import { SendPayLinkTestHandler } from "../commands/send-pay-link-test.handler.js";
import { InMemoryPayLinkTests, RecordingPayLinks } from "./pay-link-test-doubles.js";

/** L'instant fixe n'est que recopié et compté par jour : jamais comparé au mur. */
const NOW = new Date("2026-03-02T10:00:00.000Z");

function world() {
  const tests = new InMemoryPayLinkTests();
  const payLinks = new RecordingPayLinks();
  const uow = new OpenableUnitOfWork();
  const mail = new RecordingStaffMemberMail(uow);
  const clock = new FixedClock(NOW);
  const handler = new SendPayLinkTestHandler(
    tests,
    payLinks,
    mail,
    new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Jeanne", lastName: "Martin" }, "staff_1"),
    ),
    new FixedIdGenerator("plt"),
    clock,
    uow,
    inMemoryIntents(),
  );
  return { tests, payLinks, mail, clock, handler };
}

const send = (w: ReturnType<typeof world>, key: string = randomUUID()) =>
  w.handler.execute(new SendPayLinkTestCommand("staff_1", "staff_2", key));

describe("envoyer un lien de paiement d'essai", () => {
  it("l'essai, sous le verrou, puis son lien et l'e-mail au membre choisi", async () => {
    const w = world();

    const created = await send(w);

    expect(created.url.startsWith("https://app.lfc.test/payer/")).toBe(true);
    expect(w.tests.trace).toEqual(["lock", `add:${created.id}`]);
    expect(w.tests.rows.get(created.id)).toMatchObject({
      state: "sent",
      amountCents: 100,
      createdByStaffId: "staff_1",
      createdAt: NOW,
    });
    expect(w.payLinks.opened).toEqual([
      {
        subject: { type: "payment_test", id: created.id },
        request: {
          origin: "lafoliecoffee_test",
          payerLabel: "Essai du paiement par lien",
          by: "staff_1",
          byLabel: "Jeanne Martin",
        },
      },
    ]);
    expect(w.mail.queued).toEqual([
      {
        staffUserId: "staff_2",
        template: "staff.pay-link-test",
        data: { payUrl: created.url },
        subjects: [{ type: "pay_link_test", id: created.id }],
        idempotencyKey: `mail:payment.pay_link_test:${created.id}`,
      },
    ]);
  });

  /** Régression : un double clic envoyait deux liens payables. */
  it("la même clé d'intention rend le même essai, sans un second envoi", async () => {
    const w = world();
    const key = randomUUID();

    const first = await send(w, key);
    const replay = await send(w, key);

    expect(replay).toEqual(first);
    expect(w.tests.rows.size).toBe(1);
    expect(w.mail.queued).toHaveLength(1);
  });

  it(`refuse le ${String(PAY_LINK_TEST_DAILY_LIMIT + 1)}ᵉ essai du jour de Paris`, async () => {
    const w = world();
    for (let sent = 0; sent < PAY_LINK_TEST_DAILY_LIMIT; sent += 1) {
      await send(w);
    }

    await expect(send(w)).rejects.toThrow(PayLinkTestDailyLimitError);
    expect(w.tests.rows.size).toBe(PAY_LINK_TEST_DAILY_LIMIT);
    expect(w.payLinks.opened).toHaveLength(PAY_LINK_TEST_DAILY_LIMIT);
  });

  it("le lendemain à Paris, le compte repart", async () => {
    const w = world();
    for (let sent = 0; sent < PAY_LINK_TEST_DAILY_LIMIT; sent += 1) {
      await send(w);
    }
    w.clock.advanceMs(24 * 60 * 60 * 1000);

    const next = await send(w);
    expect(w.tests.rows.has(next.id)).toBe(true);
  });

  it("le refus du bloc mail (membre suspendu) remonte tel quel", async () => {
    const w = world();
    w.mail.failWith = new StaffMemberUnreachableError("staff_2", "suspended");

    await expect(send(w)).rejects.toThrow(StaffMemberUnreachableError);
    expect(w.mail.queued).toEqual([]);
  });
});
