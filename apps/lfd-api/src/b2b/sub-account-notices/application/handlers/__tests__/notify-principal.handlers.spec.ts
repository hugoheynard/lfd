import type { AcceptedMember } from "../../../../account/domain/ports/accepted-members.reader.js";
import type { CompanyStatus } from "../../../../account/domain/value-objects/company-status.js";
import type { OrderNoticeSummary } from "../../../../orders/domain/ports/order-notice-summary.reader.js";
import { OrderCancelledEvent } from "../../../../orders/domain/events/order-cancelled.event.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InMemoryNoticeRules, InMemoryNoticeSwitches } from "../../__tests__/notice-doubles.js";
import {
  chaletOrder,
  FixedLifecycle,
  FixedMembers,
  FixedOrderSummaries,
  MemoryNoticeJournal,
  RecordingMailer,
} from "../../__tests__/order-notice-doubles.js";
import { PrincipalNoticeSender } from "../../services/principal-notice.sender.js";
import { SubAccountNoticeDispatcher } from "../../services/sub-account-notice.dispatcher.js";
import { NotifyPrincipalOnOrderCancelled } from "../notify-principal-on-order-cancelled.handler.js";
import { NotifyPrincipalOnOrderPaid } from "../notify-principal-on-order-paid.handler.js";
import { NotifyPrincipalOnOrderPlaced } from "../notify-principal-on-order-placed.handler.js";
import { NotifyPrincipalOnPaymentFailed } from "../notify-principal-on-payment-failed.handler.js";

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
];

interface Options {
  readonly order?: OrderNoticeSummary;
  readonly status?: CompanyStatus;
  readonly members?: readonly AcceptedMember[];
  readonly switches?: InMemoryNoticeSwitches;
}

function build(options: Options = {}) {
  const mailer = new RecordingMailer();
  const journal = new MemoryNoticeJournal();
  const rules = new InMemoryNoticeRules();
  const dispatcher = new SubAccountNoticeDispatcher(
    new FixedOrderSummaries([options.order ?? chaletOrder()]),
    new PrincipalNoticeSender(
      options.switches ?? new InMemoryNoticeSwitches("alpes"),
      new FixedLifecycle(new Map([["alpes", options.status ?? "active"]])),
      rules,
      new FixedMembers(new Map([["alpes", options.members ?? ALPES]])),
      journal,
      new FixedClock(new Date(Date.UTC(2030, 0, 1, 10))),
      mailer,
    ),
  );
  return {
    mailer,
    journal,
    rules,
    placed: new NotifyPrincipalOnOrderPlaced(dispatcher),
    paid: new NotifyPrincipalOnOrderPaid(dispatcher),
    cancelled: new NotifyPrincipalOnOrderCancelled(dispatcher),
    failed: new NotifyPrincipalOnPaymentFailed(dispatcher),
  };
}

const placedFact = { eventId: "evt_1", type: "commerce.order_placed", payload: { orderId: "o1" } };
const failedFact = (cause: string) => ({
  eventId: `evt_${cause}`,
  type: "order.payment_failed",
  payload: { orderId: "o1", cause },
});
const cancelledFact = (cancelledByUserId: string | null) => ({
  eventId: "evt_c",
  type: "order.cancelled",
  payload: new OrderCancelledEvent(
    "o1",
    "CMD-0001",
    "housekeeper",
    cancelledByUserId === null ? "staff_1" : null,
    cancelledByUserId === null ? "erreur de saisie" : null,
    "account",
    null,
    null,
    cancelledByUserId === null ? "staff" : "customer",
    cancelledByUserId,
  ).durableFact().payload,
});

const recipients = (mailer: RecordingMailer) => mailer.sent.map((mail) => mail.to);

describe("NotifyPrincipalOnOrderPlaced", () => {
  it("prévient owner, admin et orders du principal — pas billing", async () => {
    const { placed, mailer } = build();

    await placed.handle(placedFact);

    expect(recipients(mailer)).toEqual([
      "owner@alpes.test",
      "admin@alpes.test",
      "buyer@alpes.test",
    ]);
    expect(mailer.sent[0]).toMatchObject({
      template: "customer.sub-account-activity",
      data: {
        activity: "placed",
        siteName: "Chalet Gentiane",
        orderNumber: "CMD-0001",
        totalCents: 4_200,
        enteredByTeam: false,
      },
      idempotencyKey: "sub-account-notice:evt_1:owner",
    });
  });

  it("ne prévient pas l'auteur, membre aussi du principal", async () => {
    const { placed, mailer } = build({ order: chaletOrder({ placedByUserId: "admin" }) });

    await placed.handle(placedFact);

    expect(recipients(mailer)).not.toContain("admin@alpes.test");
  });

  it("une commande saisie par l'équipe : personne côté client n'est l'auteur, et le mail le dit", async () => {
    const { placed, mailer } = build({
      order: chaletOrder({ placedByUserId: "admin", enteredByTeam: true }),
    });

    await placed.handle(placedFact);

    expect(recipients(mailer)).toContain("admin@alpes.test");
    expect(mailer.sent[0]?.data).toMatchObject({ enteredByTeam: true });
  });

  it("tait le montant quand le principal ne le voit pas (Q1)", async () => {
    const { placed, mailer } = build({ order: chaletOrder({ principalSeesAmount: false }) });

    await placed.handle(placedFact);

    expect(mailer.sent[0]?.data).toMatchObject({ totalCents: null });
  });

  it("rien sans principal copié", async () => {
    const { placed, mailer } = build({ order: chaletOrder({ principalCompanyId: null }) });

    await placed.handle(placedFact);

    expect(mailer.sent).toEqual([]);
  });

  it("rien pour un principal résilié ; un principal suspendu est prévenu (Q2)", async () => {
    const terminated = build({ status: "terminated" });
    await terminated.placed.handle(placedFact);
    expect(terminated.mailer.sent).toEqual([]);

    const suspended = build({ status: "suspended" });
    await suspended.placed.handle(placedFact);
    expect(suspended.mailer.sent).toHaveLength(3);
  });

  it("suit les dérogations du staff", async () => {
    const { placed, mailer, rules } = build();
    await rules.writer.set(
      "alpes",
      { kind: "order_placed", role: "orders", enabled: false },
      "staff_1",
      new Date(Date.UTC(2030, 0, 1)),
    );

    await placed.handle(placedFact);

    expect(recipients(mailer)).toEqual(["owner@alpes.test", "admin@alpes.test"]);
  });

  it("une relivraison du même fait n'envoie rien de plus (journal d'envoi)", async () => {
    const { placed, mailer, journal } = build();
    await placed.handle(placedFact);

    await placed.handle(placedFact);

    expect(mailer.sent).toHaveLength(3);
    expect(journal.rows.size).toBe(3);
  });
});

describe("NotifyPrincipalOnOrderCancelled", () => {
  it("annulée par l'équipe : tout le monde au rôle coché, auteur de la commande compris", async () => {
    const { cancelled, mailer } = build({ order: chaletOrder({ placedByUserId: "buyer" }) });

    await cancelled.handle(cancelledFact(null));

    expect(recipients(mailer)).toEqual([
      "owner@alpes.test",
      "admin@alpes.test",
      "buyer@alpes.test",
    ]);
    expect(mailer.sent[0]?.data).toMatchObject({ activity: "cancelled" });
  });

  it("annulée par un client : il n'est pas prévenu de son geste", async () => {
    const { cancelled, mailer } = build();

    await cancelled.handle(cancelledFact("owner"));

    expect(recipients(mailer)).toEqual(["admin@alpes.test", "buyer@alpes.test"]);
  });
});

describe("NotifyPrincipalOnPaymentFailed", () => {
  it("refus de carte au compte du principal : owner et billing", async () => {
    const { failed, mailer } = build();

    await failed.handle(failedFact("refused"));

    expect(recipients(mailer)).toEqual(["owner@alpes.test", "accountant@alpes.test"]);
    expect(mailer.sent[0]?.data).toMatchObject({ activity: "payment_failed" });
  });

  it("rien quand le site paie lui-même (« à la charge du principal », §1)", async () => {
    const { failed, mailer } = build({ order: chaletOrder({ billedCompanyId: "chalet" }) });

    await failed.handle(failedFact("refused"));

    expect(mailer.sent).toEqual([]);
  });

  it("l'abandon passe par la ligne « annulée ou abandonnée », sans prévenir l'auteur", async () => {
    const { failed, mailer } = build({ order: chaletOrder({ placedByUserId: "admin" }) });

    await failed.handle(failedFact("abandoned"));

    expect(recipients(mailer)).toEqual(["owner@alpes.test", "buyer@alpes.test"]);
    expect(mailer.sent[0]?.data).toMatchObject({ activity: "abandoned" });
  });

  it("rien pour les causes de la seule clientèle publique", async () => {
    const { failed, mailer } = build();

    await failed.handle(failedFact("expired"));
    await failed.handle(failedFact("replaced"));

    expect(mailer.sent).toEqual([]);
  });
});

describe("une commande CARTE (Hugo, 2026-10-20)", () => {
  const card = chaletOrder({ settledAtPlacement: false });
  const paidFact = { eventId: "evt_p", type: "order.paid", payload: { orderId: "o1" } };

  it("rien à la passation : l'avis attend le paiement confirmé", async () => {
    const { placed, mailer } = build({ order: card });

    await placed.handle(placedFact);

    expect(mailer.sent).toEqual([]);
  });

  it("annoncée « passée » au paiement confirmé, sans prévenir l'auteur", async () => {
    const { paid, mailer } = build({
      order: chaletOrder({ settledAtPlacement: false, placedByUserId: "admin" }),
    });

    await paid.handle(paidFact);

    expect(recipients(mailer)).toEqual(["owner@alpes.test", "buyer@alpes.test"]);
    expect(mailer.sent[0]).toMatchObject({
      data: { activity: "placed" },
      idempotencyKey: "sub-account-notice:evt_p:owner",
    });
  });

  it("une commande au compte n'est jamais annoncée au paiement", async () => {
    const { paid, mailer } = build();

    await paid.handle(paidFact);

    expect(mailer.sent).toEqual([]);
  });
});

describe("l'interrupteur, sur le chemin des commandes (N2)", () => {
  it("un principal aux avis désactivés n'est pas prévenu d'une commande", async () => {
    const { placed, mailer, journal } = build({ switches: new InMemoryNoticeSwitches() });
    await placed.handle(placedFact);
    expect(mailer.sent).toEqual([]);
    expect(journal.rows.size).toBe(0);
  });
});
