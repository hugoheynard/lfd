import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { PAY_LINK_TEST_PAYABLE_MS, PayLinkTest } from "../../domain/pay-link-test.js";
import { payLinkTestSubject } from "../../domain/pay-link-test-subject.js";
import {
  ReachableStaff,
  type StaffContact,
} from "../../../../../staff/directory/domain/staff-contacts.js";
import { ListPayLinkTestRecipientsHandler } from "../queries/list-pay-link-test-recipients.handler.js";
import { ListPayLinkTestsHandler } from "../queries/list-pay-link-tests.handler.js";
import {
  InMemoryPayLinkTestReader,
  InMemoryPayLinkTests,
  RecordingPayLinks,
} from "./pay-link-test-doubles.js";

/** Les instants ne sont comparés qu'entre eux et à l'horloge fixe. */
const NOW = new Date("2026-03-03T10:00:00.000Z");
const RECENT = new Date(NOW.getTime() - 60_000);
const OLD = new Date(NOW.getTime() - PAY_LINK_TEST_PAYABLE_MS - 60_000);

async function world() {
  const tests = new InMemoryPayLinkTests();
  const payLinks = new RecordingPayLinks();
  for (const [id, at] of [
    ["plt_open", RECENT],
    ["plt_old", OLD],
    ["plt_paid", RECENT],
  ] as const) {
    await tests.add(PayLinkTest.send({ id, createdAt: at, createdByStaffId: "staff_1" }));
    await payLinks.open(payLinkTestSubject(id), {
      origin: "lafoliecoffee_test",
      payerLabel: "Essai du paiement par lien",
      by: "staff_1",
      byLabel: null,
    });
  }
  const paid = await tests.load("plt_paid");
  paid?.markPaid(RECENT);
  if (paid !== null && paid !== undefined) {
    await tests.save(paid);
  }
  return new ListPayLinkTestsHandler(
    new InMemoryPayLinkTestReader(tests),
    payLinks,
    new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Jeanne", lastName: "Martin" }, "staff_1"),
    ),
    new FixedClock(NOW),
  );
}

describe("la liste des essais", () => {
  it("« expiré » calculé, l'auteur nommé, l'adresse tant que l'essai se paie", async () => {
    const views = await (await world()).execute();
    const byId = new Map(views.map((view) => [view.id, view]));

    expect(byId.get("plt_open")).toMatchObject({ state: "sent", createdByLabel: "Jeanne Martin" });
    expect(byId.get("plt_open")?.url?.startsWith("https://app.lfc.test/payer/")).toBe(true);
    expect(byId.get("plt_old")).toMatchObject({ state: "expired", url: null });
    expect(byId.get("plt_paid")).toMatchObject({
      state: "paid",
      paidAt: RECENT.toISOString(),
      refundedAt: null,
      url: null,
    });
    expect(views.at(-1)?.id).toBe("plt_old");
  });
});

class FixedReachable extends ReachableStaff {
  list(): Promise<readonly StaffContact[]> {
    return Promise.resolve([
      {
        staffUserId: "staff_2",
        firstName: "Anne",
        lastName: "Compta",
        email: "anne@lfc.test",
        jobTitle: "",
        active: true,
      },
    ]);
  }
}

describe("les destinataires possibles d'un essai", () => {
  it("le nom et la fiche, jamais l'adresse", async () => {
    expect(await new ListPayLinkTestRecipientsHandler(new FixedReachable()).execute()).toEqual([
      { staffUserId: "staff_2", label: "Anne Compta" },
    ]);
  });
});
