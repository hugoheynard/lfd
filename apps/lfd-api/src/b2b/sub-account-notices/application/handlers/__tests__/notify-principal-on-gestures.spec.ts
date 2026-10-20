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
import {
  DELIVERY_ADDRESS_ADDED,
  SiteGestureFact,
  SiteGesturePayloadError,
  type SiteGestureStamp,
} from "../../../../account/domain/events/site-gesture.fact.js";
import { NotifyPrincipalOnDefaultDeliverySet } from "../notify-principal-on-default-delivery-set.handler.js";
import { NotifyPrincipalOnDeliveryAddressAdded } from "../notify-principal-on-delivery-address-added.handler.js";
import { NotifyPrincipalOnDeliveryAddressRemoved } from "../notify-principal-on-delivery-address-removed.handler.js";
import { NotifyPrincipalOnDeliveryAddressUpdated } from "../notify-principal-on-delivery-address-updated.handler.js";
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
    added: new NotifyPrincipalOnDeliveryAddressAdded(gestures),
    updated: new NotifyPrincipalOnDeliveryAddressUpdated(gestures),
    removed: new NotifyPrincipalOnDeliveryAddressRemoved(gestures),
    defaulted: new NotifyPrincipalOnDefaultDeliverySet(gestures),
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

const CUSTOMER: SiteGestureStamp = {
  siteCompanyId: "chalet",
  siteName: "Chalet Gentiane",
  principalCompanyId: "alpes",
  authorUserId: "housekeeper",
  byTeam: false,
};

function addressFact(stamp: SiteGestureStamp = CUSTOMER, eventId = "evt_addr") {
  const fact = new SiteGestureFact(DELIVERY_ADDRESS_ADDED, "g1", "addr_1", stamp);
  return { eventId, type: DELIVERY_ADDRESS_ADDED, payload: fact.durableFact().payload };
}

describe("les gestes du carnet de livraison d'un site (N4b)", () => {
  it("geste client : owner et admin du principal, moins l'auteure ; rien de l'adresse", async () => {
    const { added, mailer } = build();
    await added.handle(addressFact());

    expect(recipients(mailer)).toEqual(["admin@alpes.test", "owner@alpes.test"]);
    expect(mailer.sent[0]).toMatchObject({
      template: "customer.sub-account-gesture",
      data: {
        gesture: "delivery_address_added",
        siteName: "Chalet Gentiane",
        reference: null,
        byTeam: false,
      },
    });
  });

  it("geste de l'équipe : « notre équipe », et personne n'est retiré", async () => {
    const { updated, mailer } = build();
    await updated.handle(addressFact({ ...CUSTOMER, authorUserId: null, byTeam: true }));

    expect(recipients(mailer)).toEqual(
      ["admin@alpes.test", "housekeeper@alpes.test", "owner@alpes.test"].sort(),
    );
    expect(mailer.sent.every((m) => (m.data as { byTeam: boolean }).byTeam)).toBe(true);
  });

  it("chaque abonné dit SON geste", async () => {
    const { added, updated, removed, defaulted, mailer } = build();
    await added.handle(addressFact(CUSTOMER, "e1"));
    await updated.handle(addressFact(CUSTOMER, "e2"));
    await removed.handle(addressFact(CUSTOMER, "e3"));
    await defaulted.handle(addressFact(CUSTOMER, "e4"));

    const gestures = new Set(mailer.sent.map((m) => (m.data as { gesture: string }).gesture));
    expect([...gestures]).toEqual([
      "delivery_address_added",
      "delivery_address_updated",
      "delivery_address_removed",
      "default_delivery_set",
    ]);
  });

  it("un site sans principal : personne", async () => {
    const { added, mailer } = build();
    await added.handle(addressFact({ ...CUSTOMER, principalCompanyId: null }));
    expect(mailer.sent).toEqual([]);
  });

  it("une relivraison n'envoie aucun doublon", async () => {
    const { added, mailer } = build();
    await added.handle(addressFact());
    await added.handle(addressFact());
    expect(mailer.sent).toHaveLength(2);
  });

  it("une charge illisible lève, sans rien envoyer", async () => {
    const { added, mailer } = build();
    await expect(
      added.handle({ eventId: "e", type: DELIVERY_ADDRESS_ADDED, payload: { siteName: "x" } }),
    ).rejects.toThrow(SiteGesturePayloadError);
    expect(mailer.sent).toEqual([]);
  });
});
