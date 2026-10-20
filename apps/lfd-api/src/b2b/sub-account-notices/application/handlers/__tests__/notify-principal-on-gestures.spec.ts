import type { AcceptedMember } from "../../../../account/domain/ports/accepted-members.reader.js";
import type { CompanyStatus } from "../../../../account/domain/value-objects/company-status.js";
import { OrderProblemReportedFact } from "../../../../contact/domain/order-problem-reported.fact.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InMemoryNoticeRules } from "../../__tests__/notice-doubles.js";
import {
  FixedLifecycle,
  FixedMembers,
  MemoryNoticeJournal,
  RecordingMailer,
} from "../../__tests__/order-notice-doubles.js";
import { GestureNoticeDispatcher } from "../../services/gesture-notice.dispatcher.js";
import { PrincipalNoticeSender } from "../../services/principal-notice.sender.js";
import { NotifyPrincipalOnOrderProblemReported } from "../notify-principal-on-order-problem-reported.handler.js";

const member = (userId: string, role: AcceptedMember["role"]): AcceptedMember => ({
  userId,
  email: `${userId}@alpes.test`,
  role,
});

const ALPES = [
  member("owner", "owner"),
  member("admin", "admin"),
  member("buyer", "orders"),
  member("accountant", "billing"),
  // La gouvernante : membre du principal, et l'auteure du signalement.
  member("housekeeper", "admin"),
];

function build(status: CompanyStatus = "active") {
  const mailer = new RecordingMailer();
  const journal = new MemoryNoticeJournal();
  const rules = new InMemoryNoticeRules();
  const sender = new PrincipalNoticeSender(
    new FixedLifecycle(new Map([["alpes", status]])),
    rules,
    new FixedMembers(new Map([["alpes", ALPES]])),
    journal,
    new FixedClock(new Date(Date.UTC(2030, 0, 1, 10))),
    mailer,
  );
  const gestures = new GestureNoticeDispatcher(sender);
  return {
    mailer,
    journal,
    rules,
    gestures,
    reported: new NotifyPrincipalOnOrderProblemReported(gestures),
  };
}

function reportedFact(principalCompanyId: string | null = "alpes") {
  const fact = new OrderProblemReportedFact(
    "req_1",
    "o1",
    "CMD-0001",
    { companyId: "chalet", name: "Chalet Gentiane", principalCompanyId },
    "housekeeper",
  );
  return { eventId: "evt_pb", type: "order.problem_reported", payload: fact.durableFact().payload };
}

const recipients = (mailer: RecordingMailer): string[] => mailer.sent.map((m) => m.to).sort();

describe("NotifyPrincipalOnOrderProblemReported — problème signalé par un site", () => {
  it("prévient owner, admin et orders du principal, moins l'auteure ; dit le site et la commande", async () => {
    const { reported, mailer } = build();

    await reported.handle(reportedFact());

    expect(recipients(mailer)).toEqual(
      ["admin@alpes.test", "buyer@alpes.test", "owner@alpes.test"].sort(),
    );
    expect(mailer.sent[0]).toMatchObject({
      template: "customer.sub-account-gesture",
      data: {
        gesture: "problem_reported",
        siteName: "Chalet Gentiane",
        reference: "CMD-0001",
        byTeam: false,
      },
      idempotencyKey: "sub-account-notice:evt_pb:owner",
    });
  });

  /** BLOQUANT 2 de vitruve : pas de repli sur la hiérarchie vivante. */
  it("une commande d'avant la copie du principal ne prévient personne", async () => {
    const { reported, mailer } = build();
    await reported.handle(reportedFact(null));
    expect(mailer.sent).toEqual([]);
  });

  it("une dérogation qui retire orders le fait taire", async () => {
    const { reported, mailer, rules } = build();
    await rules.writer.set(
      "alpes",
      { kind: "order_problem_reported", role: "orders", enabled: false },
      "staff_1",
      new Date(Date.UTC(2030, 0, 1)),
    );
    await reported.handle(reportedFact());
    expect(recipients(mailer)).toEqual(["admin@alpes.test", "owner@alpes.test"]);
  });

  it("principal résilié : personne (Q2)", async () => {
    const { reported, mailer } = build("terminated");
    await reported.handle(reportedFact());
    expect(mailer.sent).toEqual([]);
  });

  it("une relivraison du même fait n'envoie aucun doublon", async () => {
    const { reported, mailer } = build();
    await reported.handle(reportedFact());
    await reported.handle(reportedFact());
    expect(mailer.sent).toHaveLength(3);
  });
});

describe("GestureNoticeDispatcher — un geste de l'équipe", () => {
  it("dit « fait par notre équipe » et ne retire personne", async () => {
    const { gestures, mailer } = build();
    await gestures.notify({
      eventId: "evt_team",
      kind: "order_problem_reported",
      gesture: "problem_reported",
      principalCompanyId: "alpes",
      siteName: "Chalet Gentiane",
      reference: "CMD-0001",
      authorUserId: null,
      byTeam: true,
    });
    expect(recipients(mailer)).toEqual(
      ["admin@alpes.test", "buyer@alpes.test", "housekeeper@alpes.test", "owner@alpes.test"].sort(),
    );
    expect(mailer.sent.every((m) => (m.data as { byTeam: boolean }).byTeam)).toBe(true);
  });
});
