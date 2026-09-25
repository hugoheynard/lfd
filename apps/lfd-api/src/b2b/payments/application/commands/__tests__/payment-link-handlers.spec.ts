import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  PaymentLinkAboveCapError,
  PaymentLinkCompanyNotFoundError,
  PaymentLinkNotFoundError,
  PaymentLinkNotOpenError,
} from "../../../domain/errors/payment-link-errors.js";
import { CancelPaymentLinkCommand } from "../cancel-payment-link.command.js";
import { CancelPaymentLinkHandler } from "../cancel-payment-link.handler.js";
import { CreatePaymentLinkCommand } from "../create-payment-link.command.js";
import { CreatePaymentLinkHandler } from "../create-payment-link.handler.js";
import { ExpirePaymentLinkCommand } from "../expire-payment-link.command.js";
import { ExpirePaymentLinkHandler } from "../expire-payment-link.handler.js";
import { SettlePaymentLinkCommand } from "../settle-payment-link.command.js";
import { SettlePaymentLinkHandler } from "../settle-payment-link.handler.js";
import {
  FixedSettings,
  InMemoryPaymentLinks,
  KnownCompanies,
  RecordingCheckout,
  RecordingNotifier,
} from "./payment-link-doubles.js";

/**
 * Les liens de paiement libres, de la création au webhook (plan
 * `plan-blocage-prelevement-et-liens-de-paiement.md` §2b). Aucune date n'est
 * comparée à l'horloge : l'instant fixe n'est que recopié.
 */
const NOW = new Date("2026-01-10T09:00:00.000Z");
const COMPANIES = new KnownCompanies({ co_1: "Les Halles" });

interface World {
  readonly links: InMemoryPaymentLinks;
  readonly checkout: RecordingCheckout;
  readonly events: RecordingPublisher;
  readonly notifier: RecordingNotifier;
  readonly clock: FixedClock;
  create(cap?: number | null): CreatePaymentLinkHandler;
  readonly cancel: CancelPaymentLinkHandler;
  readonly settle: SettlePaymentLinkHandler;
  readonly expire: ExpirePaymentLinkHandler;
}

function world(): World {
  const links = new InMemoryPaymentLinks();
  const checkout = new RecordingCheckout();
  const events = new RecordingPublisher();
  const notifier = new RecordingNotifier();
  const clock = new FixedClock(NOW);
  const ids = new FixedIdGenerator("pl");
  const uow = new DirectUnitOfWork();
  return {
    links,
    checkout,
    events,
    notifier,
    clock,
    create: (cap = null) =>
      new CreatePaymentLinkHandler(
        new FixedSettings(cap),
        COMPANIES,
        checkout,
        links,
        ids,
        clock,
        events,
        uow,
      ),
    cancel: new CancelPaymentLinkHandler(links, COMPANIES, checkout, clock, events, uow),
    settle: new SettlePaymentLinkHandler(links, COMPANIES, notifier, clock),
    expire: new ExpirePaymentLinkHandler(links),
  };
}

async function openOne(w: World): Promise<{ id: string; sessionId: string }> {
  const created = await w
    .create()
    .execute(new CreatePaymentLinkCommand("co_1", 12_000, "Régularisation août", "staff_1"));
  const sessionId = w.links.rows.get(created.id)?.stripeSessionId ?? "";
  return { id: created.id, sessionId };
}

describe("CreatePaymentLinkHandler", () => {
  it("ouvre une page Stripe avec l'id du lien en métadonnée, range le lien et journalise", async () => {
    const w = world();
    const created = await w
      .create()
      .execute(new CreatePaymentLinkCommand("co_1", 12_000, "Régularisation août", "staff_1"));

    expect(w.checkout.opened).toEqual([
      {
        amountCents: 12_000,
        currency: "eur",
        label: "Régularisation août",
        companyId: "co_1",
        paymentLinkId: created.id,
      },
    ]);
    expect(created.url).toBe("https://checkout.stripe.test/cs_test_1");
    expect(w.links.rows.get(created.id)).toMatchObject({
      status: "open",
      createdAt: NOW,
      createdByStaffId: "staff_1",
    });
    expect(w.events.factTypes()).toEqual(["payment_link.created"]);
    expect(w.events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "company",
      subjectId: "co_1",
      payload: { subjectLabel: "Les Halles", amountCents: 12_000 },
    });
  });

  it("🔴 refuse au-delà du plafond AVANT d'ouvrir une page chez Stripe", async () => {
    const w = world();
    await expect(
      w.create(10_000).execute(new CreatePaymentLinkCommand("co_1", 10_001, "Trop", "staff_1")),
    ).rejects.toBeInstanceOf(PaymentLinkAboveCapError);
    // Une session ouverte puis refusée resterait payable sans ligne pour la rapprocher.
    expect(w.checkout.opened).toEqual([]);
    expect(w.links.saves).toBe(0);
  });

  it("refuse une société inconnue, sans rien ouvrir", async () => {
    const w = world();
    await expect(
      w.create().execute(new CreatePaymentLinkCommand("co_x", 100, "Qui ?", "staff_1")),
    ).rejects.toBeInstanceOf(PaymentLinkCompanyNotFoundError);
    expect(w.checkout.opened).toEqual([]);
  });
});

describe("CancelPaymentLinkHandler", () => {
  it("annule, journalise, puis ferme la session chez Stripe", async () => {
    const w = world();
    const { id, sessionId } = await openOne(w);

    await w.cancel.execute(new CancelPaymentLinkCommand(id, "staff_2"));

    expect(w.links.rows.get(id)).toMatchObject({
      status: "cancelled",
      cancelledAt: NOW,
      cancelledByStaffId: "staff_2",
    });
    expect(w.events.factTypes()).toEqual(["payment_link.created", "payment_link.cancelled"]);
    expect(w.checkout.expired).toEqual([sessionId]);
  });

  it("garde l'annulation quand Stripe refuse de fermer la session", async () => {
    const w = world();
    const { id } = await openOne(w);
    w.checkout.refuseExpiry = true;

    await w.cancel.execute(new CancelPaymentLinkCommand(id, "staff_2"));

    expect(w.links.rows.get(id)?.status).toBe("cancelled");
  });

  it("refuse un lien inconnu, et un lien déjà clos", async () => {
    const w = world();
    await expect(
      w.cancel.execute(new CancelPaymentLinkCommand("pl_x", "staff_2")),
    ).rejects.toBeInstanceOf(PaymentLinkNotFoundError);

    const { id } = await openOne(w);
    await w.cancel.execute(new CancelPaymentLinkCommand(id, "staff_2"));
    await expect(
      w.cancel.execute(new CancelPaymentLinkCommand(id, "staff_2")),
    ).rejects.toBeInstanceOf(PaymentLinkNotOpenError);
    expect(w.checkout.expired).toHaveLength(1);
  });
});

describe("SettlePaymentLinkHandler — le webhook d'encaissement", () => {
  it("passe le lien à payé, une seule fois sous un webhook rejoué", async () => {
    const w = world();
    const { id, sessionId } = await openOne(w);
    const savesBefore = w.links.saves;

    await w.settle.execute(new SettlePaymentLinkCommand(sessionId));
    await w.settle.execute(new SettlePaymentLinkCommand(sessionId));

    expect(w.links.rows.get(id)).toMatchObject({ status: "paid", paidAt: NOW });
    expect(w.links.saves).toBe(savesBefore + 1);
    expect(w.notifier.notices).toEqual([]);
  });

  it("🔴 payé après annulation : passe à payé ET sonne la cloche", async () => {
    const w = world();
    const { id, sessionId } = await openOne(w);
    await w.cancel.execute(new CancelPaymentLinkCommand(id, "staff_2"));

    await w.settle.execute(new SettlePaymentLinkCommand(sessionId));

    expect(w.links.rows.get(id)?.status).toBe("paid");
    expect(w.notifier.notices).toHaveLength(1);
    expect(w.notifier.notices[0]).toMatchObject({
      kind: "payment_link.paid_after_cancel",
      subject: "Lien annulé mais payé — Les Halles",
      idempotencyKey: `notification:payment_link.paid_after_cancel:${id}`,
    });
  });

  it("ignore une session inconnue sans lever : Stripe cesserait de réessayer de toute façon", async () => {
    const w = world();
    await expect(
      w.settle.execute(new SettlePaymentLinkCommand("cs_inconnue")),
    ).resolves.toBeUndefined();
    expect(w.links.saves).toBe(0);
  });
});

describe("ExpirePaymentLinkHandler", () => {
  it("expire un lien ouvert", async () => {
    const w = world();
    const { id, sessionId } = await openOne(w);
    await w.expire.execute(new ExpirePaymentLinkCommand(sessionId));
    expect(w.links.rows.get(id)?.status).toBe("expired");
  });

  it("ne réécrit pas un lien annulé : l'expiration suit notre propre fermeture", async () => {
    const w = world();
    const { id, sessionId } = await openOne(w);
    await w.cancel.execute(new CancelPaymentLinkCommand(id, "staff_2"));
    const savesBefore = w.links.saves;

    await w.expire.execute(new ExpirePaymentLinkCommand(sessionId));

    expect(w.links.rows.get(id)?.status).toBe("cancelled");
    expect(w.links.saves).toBe(savesBefore);
  });
});
