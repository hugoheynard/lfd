import type { OrderView } from "@lfd/contracts";

import { orderPageLink } from "../../commands/__tests__/customer-cancellation-doubles.js";
import type {
  DeferrableMailTemplate,
  DeferredMailDemand,
} from "../../../../../mail/channels/requests/mail.js";
import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import { OrderReader, type OwnedOrder } from "../../../domain/ports/order.reader.js";
import {
  DELIVERY_ROUND_DEPARTED,
  DeliveryRoundDepartedFact,
  DeliveryRoundDepartedPayloadError,
} from "../../../../../delivery/channels/commerce/index.js";
import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import type { DurableSubscriber } from "../../../../../platform/outbox/durable-handler.js";
import { DeliveryEnRouteMail } from "../../services/delivery-en-route-mail.service.js";
import { MAIL_DELIVERY_EN_ROUTE, MailDeliveryEnRoute } from "../mail-delivery-en-route.handler.js";
import { OneRecipientReader, orderView } from "./payment-failure-doubles.js";
import { AT_PLACEMENT } from "../../../domain/services/order-sheet.js";
import { ShipmentRef } from "../../../../../production/channels/commerce/index.js";
import type { RemainderShipment } from "../../../domain/ports/remainder-shipment.reader.js";
import { FixedRemainders } from "./remainder-shipment-doubles.js";

/*
 * Le commerce entend le départ, fait durable (en-route.md ; plan-depart-durable.md,
 * DD1) : un courriel par commande encore en route, à l'auteur, avec une clé
 * par commande ET par tournée — DEMANDÉ au bloc `mail` dans la transaction de
 * la livraison depuis S2a (plan `plan-service-e-mails.md`).
 */

const DEPARTED = new Date(60_000);

function delivered(id: string, overrides: Partial<OrderView> = {}): OrderView {
  return {
    ...orderView("ready", "paid"),
    id,
    orderNumber: `ORD-${id}`,
    fulfillmentMethod: "delivery",
    deliveryAddress: {
      label: "Hôtel",
      ligne1: "12 rue des Lilas",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
    },
    ...overrides,
  };
}

/** Plusieurs commandes, lues par id ; tout le reste refuse. */
class ManyOrdersReader extends OrderReader {
  constructor(private readonly views: readonly OrderView[]) {
    super();
  }

  override findById(orderId: string): Promise<OwnedOrder | null> {
    const view = this.views.find((candidate) => candidate.id === orderId);
    return Promise.resolve(
      view === undefined
        ? null
        : {
            view,
            companyId: null,
            placedByUserId: "user_7",
            stripePaymentIntentId: null,
            clientele: "public",
            entryOrigin: null,
            loyaltyVoucherId: null,
            billedCustomer: null,
            buyerPhone: null,
            revision: AT_PLACEMENT,
          },
    );
  }

  override listPersonal() {
    return Promise.reject(new Error("non utilisé"));
  }

  override findAuthorByReference() {
    return Promise.reject(new Error("non utilisé"));
  }

  override findForPacking() {
    return Promise.reject(new Error("non utilisé"));
  }

  override listForProduction() {
    return Promise.reject(new Error("non utilisé"));
  }
}

class FixedOrigins extends OrderMailOrigins {
  clientBaseUrl(): string | null {
    return "https://app.lfc.test";
  }

  adminBaseUrl(): string | null {
    return null;
  }
}

/** Refuse la demande d'une commande choisie — la base qui tombe à mi-tournée. */
class FailingFor extends RecordingMail {
  constructor(
    private readonly reference: string,
    unitOfWork: OpenableUnitOfWork,
  ) {
    super(unitOfWork);
  }

  override send<K extends DeferrableMailTemplate>(demand: DeferredMailDemand<K>): Promise<string> {
    const data: unknown = demand.data;
    if (typeof data === "object" && data !== null && "reference" in data) {
      if (data.reference === this.reference) {
        return Promise.reject(new Error("base indisponible"));
      }
    }
    return super.send(demand);
  }
}

/**
 * L'abonné tel que la garde le fait tourner : `handle` dans la transaction de
 * la livraison. La porte doublée REFUSE une demande hors d'elle, comme la
 * vraie.
 */
function subscriber(
  views: readonly OrderView[],
  options: {
    readonly email?: string | null;
    readonly remainders?: ReadonlyMap<string, RemainderShipment>;
    readonly failFor?: string;
  } = {},
) {
  const unitOfWork = new OpenableUnitOfWork();
  const mailer =
    options.failFor === undefined
      ? new RecordingMail(unitOfWork)
      : new FailingFor(options.failFor, unitOfWork);
  const mail = new DeliveryEnRouteMail(
    new ManyOrdersReader(views),
    new OneRecipientReader(options.email === undefined ? "camille@halles.test" : options.email),
    new FixedOrigins(),
    orderPageLink(),
    mailer,
    new FixedRemainders(options.remainders ?? new Map()),
  );
  const handler = new MailDeliveryEnRoute(mail);
  const subject: DurableSubscriber = {
    handle: (delivery) => unitOfWork.run(() => handler.handle(delivery)),
  };
  return { subject, handler, mailer };
}

/** Le fait tel que le relais le livre : relu de sa charge, comme en production. */
function departed(
  roundId: string,
  orderIds: readonly string[],
  extra: readonly ShipmentRef[] = [],
): DurableDelivery {
  const fact = new DeliveryRoundDepartedFact(roundId, "2030-03-12", DEPARTED, [
    ...orderIds.map((orderId) => ShipmentRef.firstOf(orderId)),
    ...extra,
  ]);
  const { type, payload } = fact.durableFact();
  return { eventId: `evt_${roundId}`, type, payload };
}

describe("MailDeliveryEnRoute — abonné durable « en route »", () => {
  it("porte un nom d'abonné stable", () => {
    expect(MAIL_DELIVERY_EN_ROUTE).toBe("b2b.mail-delivery-en-route");
  });

  it("écrit une fois par commande, à l'auteur, avec une clé par commande et par tournée", async () => {
    const { subject, mailer } = subscriber([delivered("o_1"), delivered("o_2")]);

    await subject.handle(departed("r_1", ["o_1", "o_2"]));

    expect(mailer.queued.map((sent) => sent.idempotencyKey)).toEqual([
      "delivery.en_route:o_1:r_1",
      "delivery.en_route:o_2:r_1",
    ]);
    expect(mailer.queued[0]).toMatchObject({
      to: "camille@halles.test",
      template: "customer.delivery-en-route",
      data: {
        reference: "ORD-o_1",
        addressLines: ["12 rue des Lilas", "", "73150 Val d'Isère"],
        orderUrl: "https://app.lfc.test/mes-commandes/o_1",
        locale: "fr",
      },
    });
  });

  // 2026-10-28 : « Livrée à » dit le créneau de la commande — il part avec les données.
  it("passe le créneau de la commande au courriel, et `null` sans créneau", async () => {
    const window = { start: "07:00", end: "09:00" };
    const base = delivered("o_1");
    const { subject, mailer } = subscriber([
      delivered("o_1", {
        fulfillment: { ...base.fulfillment, window: { value: window, source: "override" } },
      }),
      delivered("o_2"),
    ]);

    await subject.handle(departed("r_1", ["o_1", "o_2"]));

    expect(mailer.queued[0]).toMatchObject({ data: { window } });
    expect(mailer.queued[1]).toMatchObject({ data: { window: null } });
  });

  it("rejoué, il redemande la même clé : Resend absorbe, pas de second courriel", async () => {
    const { subject, mailer } = subscriber([delivered("o_1")]);

    await subject.handle(departed("r_1", ["o_1"]));
    await subject.handle(departed("r_1", ["o_1"]));

    expect(new Set(mailer.queued.map((sent) => sent.idempotencyKey))).toEqual(
      new Set(["delivery.en_route:o_1:r_1"]),
    );
  });

  it("un second passage (une autre tournée) a son propre courriel", async () => {
    const { subject, mailer } = subscriber([delivered("o_1")]);

    await subject.handle(departed("r_1", ["o_1"]));
    await subject.handle(departed("r_2", ["o_1"]));

    expect(mailer.queued.map((sent) => sent.idempotencyKey)).toEqual([
      "delivery.en_route:o_1:r_1",
      "delivery.en_route:o_1:r_2",
    ]);
  });

  it("se tait pour une commande annulée ou déjà retirée", async () => {
    const { subject, mailer } = subscriber([
      delivered("o_1", { status: "cancelled" }),
      delivered("o_2", { status: "fulfilled" }),
      delivered("o_3", { handedOverAt: new Date(0).toISOString() }),
      delivered("o_4"),
    ]);

    await subject.handle(departed("r_1", ["o_1", "o_2", "o_3", "o_4"]));

    expect(mailer.queued.map((sent) => sent.idempotencyKey)).toEqual(["delivery.en_route:o_4:r_1"]);
  });

  describe("par envoi (plan E7 reliquat, choix 17)", () => {
    const REST = ShipmentRef.of("o_1", 2);

    it("le reste a son courriel, sa clé, et dit « le reste »", async () => {
      const { subject, mailer } = subscriber(
        [delivered("o_1", { status: "fulfilled", handedOverAt: new Date(0).toISOString() })],
        { remainders: new Map([["o_1:2", { pieces: 2, handedOver: false }]]) },
      );

      await subject.handle(departed("r_1", [], [REST]));

      expect(mailer.queued.map((sent) => sent.idempotencyKey)).toEqual([
        "delivery.en_route:o_1:r_1:r2",
      ]);
      expect(mailer.queued[0]?.data).toMatchObject({ reference: "ORD-o_1", remainder: true });
    });

    it("deux envois de la même commande dans la tournée : deux courriels", async () => {
      const { subject, mailer } = subscriber([delivered("o_1")], {
        remainders: new Map([["o_1:2", { pieces: 2, handedOver: false }]]),
      });

      await subject.handle(departed("r_1", ["o_1"], [REST]));

      expect(mailer.queued.map((sent) => sent.idempotencyKey)).toEqual([
        "delivery.en_route:o_1:r_1",
        "delivery.en_route:o_1:r_1:r2",
      ]);
      expect(mailer.queued[0]?.data).not.toHaveProperty("remainder");
    });

    it("se tait pour un reste remis, annulé, ou d'une commande annulée", async () => {
      const { subject, mailer } = subscriber(
        [delivered("o_1"), delivered("o_2", { status: "cancelled" })],
        {
          remainders: new Map([
            ["o_1:2", { pieces: 2, handedOver: true }],
            ["o_2:2", { pieces: 2, handedOver: false }],
          ]),
        },
      );

      await subject.handle(
        departed("r_1", [], [REST, ShipmentRef.of("o_1", 3), ShipmentRef.of("o_2", 2)]),
      );

      expect(mailer.queued).toEqual([]);
    });
  });

  it("se tait pour une commande disparue ou un client sans adresse", async () => {
    const { subject, mailer } = subscriber([delivered("o_1")], { email: null });

    await subject.handle(departed("r_1", ["o_1", "o_inconnue"]));

    expect(mailer.queued).toEqual([]);
  });

  /**
   * Depuis S2a, l'abonné ne fait que DEMANDER : une demande qui échoue est une
   * écriture qui tombe, et la livraison avec elle — elle sera rejouée. Les
   * demandes déjà faites ne se doublent pas au rejeu : même clé.
   */
  it("🔴 une demande qui échoue fait échouer la livraison, qui sera rejouée", async () => {
    const { subject } = subscriber([delivered("o_1"), delivered("o_2")], { failFor: "ORD-o_2" });

    await expect(subject.handle(departed("r_1", ["o_1", "o_2"]))).rejects.toThrow(
      "base indisponible",
    );
  });

  /**
   * Régression (audit du 2026-10-07, B1) : l'abonné envoyait DANS la
   * transaction que la garde ouvre pour poser le reçu — un appel à Resend par
   * commande, une connexion du pool tenue. Depuis S2a, il n'appelle plus le
   * fournisseur du tout : il DEMANDE, dans la transaction (la porte doublée
   * refuse sinon), et le bloc `mail` envoie après la validation.
   */
  it("🔴 demande dans la transaction de la livraison, et n'envoie rien lui-même", async () => {
    const { handler, mailer } = subscriber([delivered("o_1"), delivered("o_2")]);

    await expect(handler.handle(departed("r_1", ["o_1"]))).rejects.toThrow(
      "request hors transaction",
    );
    expect(mailer.awaitedReceipt).toEqual([]);
  });

  it("une charge illisible lève : la livraison échoue, sera rejouée, et rien n'est demandé", async () => {
    const { subject, mailer } = subscriber([delivered("o_1")]);
    const unreadable: DurableDelivery = {
      eventId: "evt_r_1",
      type: DELIVERY_ROUND_DEPARTED,
      payload: { roundId: "r_1", orderIds: ["o_1"] },
    };

    await expect(subject.handle(unreadable)).rejects.toThrow(DeliveryRoundDepartedPayloadError);
    expect(mailer.queued).toEqual([]);
  });
});
