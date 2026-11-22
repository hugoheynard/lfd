import { randomUUID } from "node:crypto";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  PaymentLinkAboveCapError,
  PaymentLinkCompanyNotFoundError,
  PaymentLinkNotFoundError,
  PaymentLinkNotOpenError,
  PaymentLinkUrlGoneError,
  UnknownFreeChargeNatureError,
} from "../../../domain/errors/payment-link-errors.js";
import { CancelPaymentLinkCommand } from "../cancel-payment-link.command.js";
import { CancelPaymentLinkHandler } from "../cancel-payment-link.handler.js";
import { CreatePaymentLinkCommand } from "../create-payment-link.command.js";
import { CreatePaymentLinkHandler } from "../create-payment-link.handler.js";
import {
  checkoutLink,
  FixedSettings,
  InMemoryPaymentLinks,
  KnownCompanies,
  RecordingDurable,
  RecordingPayLinks,
} from "./payment-link-doubles.js";

/**
 * Les liens de paiement libres : la demande de paiement libre par la porte, et les
 * anciens liens Stripe qui gardent leur chemin. Aucune date n'est comparée à
 * l'horloge : l'instant fixe n'est que recopié.
 */
const NOW = new Date("2026-01-10T09:00:00.000Z");
const COMPANIES = new KnownCompanies({ co_1: "Les Halles" });
const AUTHORS = new FixedStaffAuthorDirectory(
  authorsKnownAs({ firstName: "Jeanne", lastName: "Martin" }, "staff_1"),
);

function world() {
  const links = new InMemoryPaymentLinks();
  const payLinks = new RecordingPayLinks();
  const durable = new RecordingDurable();
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  const ids = new FixedIdGenerator("pl");
  const uow = new DirectUnitOfWork();
  const intents = inMemoryIntents();
  return {
    links,
    payLinks,
    durable,
    events,
    create: (cap: number | null = null) =>
      new CreatePaymentLinkHandler(
        new FixedSettings(cap),
        COMPANIES,
        payLinks,
        links,
        ids,
        clock,
        events,
        uow,
        intents,
        AUTHORS,
      ),
    cancel: new CancelPaymentLinkHandler(links, COMPANIES, payLinks, durable, clock, events, uow),
  };
}
type World = ReturnType<typeof world>;

function createCommand(key: string = randomUUID()): CreatePaymentLinkCommand {
  return new CreatePaymentLinkCommand(
    "co_1",
    12_000,
    "Régularisation août",
    "regularization",
    "staff_1",
    key,
  );
}

/** Un ancien lien Stripe, rangé comme sa ligne le porte. */
async function seedCheckout(w: World): Promise<{ id: string }> {
  await w.links.save(checkoutLink("pl_old", "co_1", "cs_old", NOW));
  return { id: "pl_old" };
}

describe("CreatePaymentLinkHandler — la demande de paiement libre par la porte", () => {
  it("range la demande de paiement libre en canal door, ouvre son lien free_charge et rend son adresse", async () => {
    const w = world();
    const created = await w.create().execute(createCommand());

    expect(created).toEqual({ id: "pl_000001", url: "https://app.lfc.test/payer/tok_1" });
    expect(w.payLinks.opened).toEqual([
      {
        subject: { type: "free_charge", id: created.id },
        request: {
          origin: "lafoliecoffee",
          payerLabel: "Les Halles",
          by: "staff_1",
          byLabel: "Jeanne Martin",
        },
      },
    ]);
    expect(w.links.rows.get(created.id)).toMatchObject({
      status: "open",
      stripeSessionId: null,
      url: null,
      createdAt: NOW,
      createdByStaffId: "staff_1",
    });
    expect(w.events.factTypes()).toEqual(["payment_link.created"]);
  });

  it("une fiche introuvable donne un auteur sans nom, jamais un nom inventé", async () => {
    const w = world();
    await w
      .create()
      .execute(new CreatePaymentLinkCommand("co_1", 100, "Acompte", "other", "staff_x", "k"));

    expect(w.payLinks.opened.map((opened) => opened.request.byLabel)).toEqual([null]);
  });

  it("🔴 refuse au-delà du plafond sans rien écrire ni ouvrir", async () => {
    const w = world();
    await expect(
      w
        .create(10_000)
        .execute(
          new CreatePaymentLinkCommand("co_1", 10_001, "Trop", "other", "staff_1", randomUUID()),
        ),
    ).rejects.toBeInstanceOf(PaymentLinkAboveCapError);
    expect(w.payLinks.opened).toEqual([]);
    expect(w.links.saves).toBe(0);
  });

  it("refuse une société inconnue, sans rien ouvrir", async () => {
    const w = world();
    await expect(
      w
        .create()
        .execute(
          new CreatePaymentLinkCommand("co_x", 100, "Qui ?", "other", "staff_1", randomUUID()),
        ),
    ).rejects.toBeInstanceOf(PaymentLinkCompanyNotFoundError);
    expect(w.payLinks.opened).toEqual([]);
  });
});

describe("CreatePaymentLinkHandler — une fois par intention", () => {
  /** Régression : un double clic ouvrait deux pages payables pour la même somme. */
  it("la même clé rend le même lien, relu par urlOf, sans rien rouvrir", async () => {
    const w = world();
    const handler = w.create();
    const first = await handler.execute(createCommand("cle-1"));
    const replay = await handler.execute(createCommand("cle-1"));

    expect(replay).toEqual(first);
    expect(w.payLinks.opened).toHaveLength(1);
    expect(w.links.rows.size).toBe(1);
  });

  it("le rejeu d'une demande de paiement libre annulée depuis le dit, au lieu d'inventer une adresse", async () => {
    const w = world();
    const handler = w.create();
    const first = await handler.execute(createCommand("cle-2"));
    await w.cancel.execute(new CancelPaymentLinkCommand(first.id, "staff_2"));

    await expect(handler.execute(createCommand("cle-2"))).rejects.toBeInstanceOf(
      PaymentLinkUrlGoneError,
    );
  });
});

describe("CreatePaymentLinkHandler — la nature", () => {
  it("range la nature choisie et la reprend dans le fait payment_link.created", async () => {
    const w = world();
    const { id } = await w.create().execute(createCommand());

    expect(w.links.rows.get(id)?.nature).toBe("regularization");
    expect(w.events.traced.map((event) => event.journalFact().payload)).toEqual([
      expect.objectContaining({ nature: "regularization" }),
    ]);
  });

  it("refuse une nature hors registre sans rien écrire ni ouvrir", async () => {
    const w = world();
    await expect(
      w
        .create()
        .execute(new CreatePaymentLinkCommand("co_1", 100, "Divers", "bribe", "staff_1", "k")),
    ).rejects.toBeInstanceOf(UnknownFreeChargeNatureError);
    expect(w.links.rows.size).toBe(0);
    expect(w.payLinks.opened).toEqual([]);
  });
});

describe("CancelPaymentLinkHandler — une demande de paiement libre par la porte", () => {
  it("annule, révoque le lien et écrit le fait durable, sans réseau", async () => {
    const w = world();
    const { id } = await w.create().execute(createCommand());

    await w.cancel.execute(new CancelPaymentLinkCommand(id, "staff_2"));

    expect(w.links.rows.get(id)).toMatchObject({
      status: "cancelled",
      cancelledAt: NOW,
      cancelledByStaffId: "staff_2",
    });
    expect(w.payLinks.revoked).toEqual([
      { subject: { type: "free_charge", id }, reason: "cancelled" },
    ]);
    expect(w.durable.facts).toEqual([
      {
        type: "payment_link.cancelled",
        key: `payment_link.cancelled:${id}`,
        payload: { paymentLinkId: id },
      },
    ]);
    expect(w.events.factTypes()).toEqual(["payment_link.created", "payment_link.cancelled"]);
  });

  it("refuse un lien inconnu, et un lien déjà clos", async () => {
    const w = world();
    await expect(
      w.cancel.execute(new CancelPaymentLinkCommand("pl_x", "staff_2")),
    ).rejects.toBeInstanceOf(PaymentLinkNotFoundError);

    const { id } = await w.create().execute(createCommand());
    await w.cancel.execute(new CancelPaymentLinkCommand(id, "staff_2"));
    await expect(
      w.cancel.execute(new CancelPaymentLinkCommand(id, "staff_2")),
    ).rejects.toBeInstanceOf(PaymentLinkNotOpenError);
    expect(w.durable.facts).toHaveLength(1);
  });
});

describe("Les anciens liens Stripe Checkout sont des lignes historiques", () => {
  it("un ancien lien relu ouvert s'annule sans révoquer de lien ni écrire de fait durable", async () => {
    const w = world();
    const { id } = await seedCheckout(w);

    await w.cancel.execute(new CancelPaymentLinkCommand(id, "staff_2"));

    expect(w.links.rows.get(id)).toMatchObject({
      status: "cancelled",
      cancelledByStaffId: "staff_2",
      stripeSessionId: "cs_old",
      url: "https://checkout.stripe.test/cs_old",
    });
    expect(w.payLinks.revoked).toEqual([]);
    expect(w.durable.facts).toEqual([]);
    expect(w.events.factTypes()).toEqual(["payment_link.cancelled"]);
  });
});
