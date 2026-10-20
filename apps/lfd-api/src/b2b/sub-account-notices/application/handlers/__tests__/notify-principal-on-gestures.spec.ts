import type { AcceptedMember } from "../../../../account/domain/ports/accepted-members.reader.js";
import type { CompanyStatus } from "../../../../account/domain/value-objects/company-status.js";
import { OrderProblemReportedFact } from "../../../../contact/domain/order-problem-reported.fact.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InMemoryNoticeRules, InMemoryNoticeSwitches } from "../../__tests__/notice-doubles.js";
import {
  FixedLifecycle,
  FixedMembers,
  MemoryNoticeJournal,
  RecordingMailer,
} from "../../__tests__/order-notice-doubles.js";
import { GestureNoticeDispatcher } from "../../services/gesture-notice.dispatcher.js";
import { PrincipalNoticeSender } from "../../services/principal-notice.sender.js";
import {
  BANK_ACCOUNT_CHANGED,
  CONTACT_ADDED,
  DELIVERY_ADDRESS_ADDED,
  SiteGestureFact,
  SiteGesturePayloadError,
  type SiteGestureStamp,
} from "../../../../account/domain/events/site-gesture.fact.js";
import { NotifyPrincipalOnBankAccountChanged } from "../notify-principal-on-bank-account-changed.handler.js";
import { NotifyPrincipalOnMandateProofAttached } from "../notify-principal-on-mandate-proof-attached.handler.js";
import { NotifyPrincipalOnContactAdded } from "../notify-principal-on-contact-added.handler.js";
import { NotifyPrincipalOnContactRemoved } from "../notify-principal-on-contact-removed.handler.js";
import { NotifyPrincipalOnContactUpdated } from "../notify-principal-on-contact-updated.handler.js";
import { NotifyPrincipalOnPrimaryContactChanged } from "../notify-principal-on-primary-contact-changed.handler.js";
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

function build(
  status: CompanyStatus = "active",
  switches: InMemoryNoticeSwitches = new InMemoryNoticeSwitches("alpes"),
) {
  const mailer = new RecordingMailer();
  const journal = new MemoryNoticeJournal();
  const rules = new InMemoryNoticeRules();
  const sender = new PrincipalNoticeSender(
    switches,
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
    switches,
    gestures,
    reported: new NotifyPrincipalOnOrderProblemReported(gestures),
    added: new NotifyPrincipalOnDeliveryAddressAdded(gestures),
    updated: new NotifyPrincipalOnDeliveryAddressUpdated(gestures),
    removed: new NotifyPrincipalOnDeliveryAddressRemoved(gestures),
    defaulted: new NotifyPrincipalOnDefaultDeliverySet(gestures),
    contactAdded: new NotifyPrincipalOnContactAdded(gestures),
    contactUpdated: new NotifyPrincipalOnContactUpdated(gestures),
    contactRemoved: new NotifyPrincipalOnContactRemoved(gestures),
    primaryChanged: new NotifyPrincipalOnPrimaryContactChanged(gestures),
    bank: new NotifyPrincipalOnBankAccountChanged(gestures),
    proof: new NotifyPrincipalOnMandateProofAttached(gestures),
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

function contactFact(stamp: SiteGestureStamp = CUSTOMER, eventId = "evt_contact") {
  const fact = new SiteGestureFact(CONTACT_ADDED, "g1", "contact_1", stamp);
  return { eventId, type: CONTACT_ADDED, payload: fact.durableFact().payload };
}

describe("les gestes sur les contacts d'un site (N4c)", () => {
  it("geste client : owner et admin du principal, moins l'auteure ; personne n'est nommé", async () => {
    const { contactAdded, mailer } = build();
    await contactAdded.handle(contactFact());

    expect(recipients(mailer)).toEqual(["admin@alpes.test", "owner@alpes.test"]);
    expect(mailer.sent[0]?.data).toEqual({
      gesture: "contact_added",
      siteName: "Chalet Gentiane",
      reference: null,
      byTeam: false,
    });
  });

  it("geste de l'équipe : « notre équipe », et personne n'est retiré", async () => {
    const { primaryChanged, mailer } = build();
    await primaryChanged.handle(contactFact({ ...CUSTOMER, authorUserId: null, byTeam: true }));
    expect(recipients(mailer)).toEqual(
      ["admin@alpes.test", "housekeeper@alpes.test", "owner@alpes.test"].sort(),
    );
    expect(mailer.sent.every((m) => (m.data as { byTeam: boolean }).byTeam)).toBe(true);
  });

  it("chaque abonné dit SON geste", async () => {
    const { contactAdded, contactUpdated, contactRemoved, primaryChanged, mailer } = build();
    await contactAdded.handle(contactFact(CUSTOMER, "c1"));
    await contactUpdated.handle(contactFact(CUSTOMER, "c2"));
    await contactRemoved.handle(contactFact(CUSTOMER, "c3"));
    await primaryChanged.handle(contactFact(CUSTOMER, "c4"));
    const gestures = new Set(mailer.sent.map((m) => (m.data as { gesture: string }).gesture));
    expect([...gestures]).toEqual([
      "contact_added",
      "contact_updated",
      "contact_removed",
      "primary_contact_changed",
    ]);
  });

  it("une dérogation sur `contact_changed` ne touche pas les adresses", async () => {
    const { contactAdded, added, mailer, rules } = build();
    await rules.writer.set(
      "alpes",
      { kind: "contact_changed", role: "admin", enabled: false },
      "staff_1",
      new Date(Date.UTC(2030, 0, 1)),
    );
    await contactAdded.handle(contactFact(CUSTOMER, "c5"));
    await added.handle(addressFact(CUSTOMER, "a5"));
    expect(
      mailer.sent.map((m) => `${(m.data as { gesture: string }).gesture}:${m.to}`).sort(),
    ).toEqual(
      [
        "contact_added:owner@alpes.test",
        "delivery_address_added:admin@alpes.test",
        "delivery_address_added:owner@alpes.test",
      ].sort(),
    );
  });

  it("un site sans principal : personne ; une relivraison : aucun doublon", async () => {
    const { contactRemoved, mailer } = build();
    await contactRemoved.handle(contactFact({ ...CUSTOMER, principalCompanyId: null }, "n"));
    expect(mailer.sent).toEqual([]);
    await contactRemoved.handle(contactFact(CUSTOMER, "r"));
    await contactRemoved.handle(contactFact(CUSTOMER, "r"));
    expect(mailer.sent).toHaveLength(2);
  });
});

describe("l'interrupteur des avis du principal (2026-10-20)", () => {
  it("sans réglage : DÉSACTIVÉ — ni mail, ni ligne au journal d'envoi", async () => {
    const { reported, mailer, journal } = build("active", new InMemoryNoticeSwitches());
    await reported.handle(reportedFact());
    expect(mailer.sent).toEqual([]);
    expect(journal.rows.size).toBe(0);
  });

  it("coupé : rien ; réactivé : le geste d'avant n'est PAS rattrapé, le suivant part", async () => {
    const { reported, added, mailer, journal, switches } = build();
    await switches.writer.set("alpes", false, "staff_1", new Date(0));
    await reported.handle(reportedFact());
    expect(mailer.sent).toEqual([]);
    expect(journal.rows.size).toBe(0);

    await switches.writer.set("alpes", true, "staff_1", new Date(0));
    await added.handle(addressFact());
    expect(mailer.sent.map((m) => (m.data as { gesture: string }).gesture)).toEqual([
      "delivery_address_added",
      "delivery_address_added",
    ]);
  });

  it("activé : l'avis part", async () => {
    const { reported, mailer } = build();
    await reported.handle(reportedFact());
    expect(mailer.sent).toHaveLength(3);
  });
});

function bankFact(stamp: SiteGestureStamp = CUSTOMER, eventId = "evt_bank") {
  const fact = new SiteGestureFact(BANK_ACCOUNT_CHANGED, "g1", "cba_1", stamp);
  return { eventId, type: BANK_ACCOUNT_CHANGED, payload: fact.durableFact().payload };
}

describe("le RIB et la preuve de mandat d'un site (N4d)", () => {
  it("RIB par le client : owner et billing du principal ; rien du compte", async () => {
    const { bank, mailer } = build();
    await bank.handle(bankFact());

    expect(recipients(mailer)).toEqual(["accountant@alpes.test", "owner@alpes.test"]);
    expect(mailer.sent[0]?.data).toEqual({
      gesture: "bank_account_changed",
      siteName: "Chalet Gentiane",
      reference: null,
      byTeam: false,
    });
  });

  it("preuve de mandat par l'équipe : « notre équipe », sous la clé `bank_account_changed`", async () => {
    const { proof, mailer, rules } = build();
    await rules.writer.set(
      "alpes",
      { kind: "bank_account_changed", role: "owner", enabled: false },
      "staff_1",
      new Date(Date.UTC(2030, 0, 1)),
    );
    await proof.handle(bankFact({ ...CUSTOMER, authorUserId: null, byTeam: true }));
    expect(recipients(mailer)).toEqual(["accountant@alpes.test"]);
    expect(mailer.sent[0]?.data).toMatchObject({ gesture: "mandate_proof_attached", byTeam: true });
  });

  it("avis coupés : rien ; sans principal : rien ; relivraison : aucun doublon", async () => {
    const off = build("active", new InMemoryNoticeSwitches());
    await off.bank.handle(bankFact());
    expect(off.mailer.sent).toEqual([]);

    const { bank, mailer } = build();
    await bank.handle(bankFact({ ...CUSTOMER, principalCompanyId: null }, "n"));
    expect(mailer.sent).toEqual([]);
    await bank.handle(bankFact(CUSTOMER, "r"));
    await bank.handle(bankFact(CUSTOMER, "r"));
    expect(mailer.sent).toHaveLength(2);
  });
});
