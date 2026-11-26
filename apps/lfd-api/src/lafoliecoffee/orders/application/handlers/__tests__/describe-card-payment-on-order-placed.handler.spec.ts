import { CommerceOrderPlacedFact } from "../../../../../delivery/channels/commerce/commerce-order-placed.fact.js";
import {
  type CardPaymentDescription,
  CardPaymentLabels,
} from "../../../../../payment/channels/requests/index.js";
import type { CardSubject } from "../../../../../payment/channels/subjects/index.js";
import type { OwnedOrder } from "../../../domain/ports/order.reader.js";
import { AT_PLACEMENT } from "../../../domain/services/order-sheet.js";
import { DescribeCardPaymentOnOrderPlaced } from "../describe-card-payment-on-order-placed.handler.js";
import { OneOrderReader, view } from "./order-placed-mail-doubles.js";

/** Le canal des libellés, doublé : il note chaque demande. */
class RecordingLabels extends CardPaymentLabels {
  readonly asked: {
    readonly subject: CardSubject;
    readonly providerRef: string;
    readonly label: CardPaymentDescription;
  }[] = [];

  describe(
    subject: CardSubject,
    providerRef: string,
    label: CardPaymentDescription,
  ): Promise<void> {
    this.asked.push({ subject, providerRef, label });
    return Promise.resolve();
  }
}

function owned(overrides: Partial<OwnedOrder> = {}): OwnedOrder {
  return {
    view: view({ id: "ord_1", orderNumber: "2030-00042", origin: "self_service" }),
    companyId: "cmp_1",
    placedByUserId: "user_7",
    stripePaymentIntentId: "pi_1",
    clientele: "pro",
    entryOrigin: null,
    loyaltyVoucherId: null,
    billedCustomer: null,
    buyerPhone: null,
    revision: AT_PLACEMENT,
    ...overrides,
  };
}

async function deliver(order: OwnedOrder | null): Promise<RecordingLabels> {
  const labels = new RecordingLabels();
  const fact = new CommerceOrderPlacedFact("ord_1").durableFact();
  await new DescribeCardPaymentOnOrderPlaced(new OneOrderReader(order), labels).handle({
    eventId: "evt_1",
    type: fact.type,
    payload: fact.payload,
  });
  return labels;
}

describe("DescribeCardPaymentOnOrderPlaced — le numéro de commande chez le prestataire", () => {
  it("une passation pro : la description définitive, le numéro et le sujet", async () => {
    const labels = await deliver(owned());

    expect(labels.asked).toEqual([
      {
        subject: { type: "order", id: "ord_1" },
        providerRef: "pi_1",
        label: {
          description: "LFD · La Folie Coffee pro · Commande n° 2030-00042 · paiement",
          metadata: {
            app: "la-folie-coffee",
            channel: "pro",
            kind: "first",
            subject_id: "ord_1",
            order_number: "2030-00042",
          },
        },
      },
    ]);
  });

  it("une commande sans société est la boutique", async () => {
    const labels = await deliver(owned({ companyId: null, clientele: "public" }));

    expect(labels.asked[0]?.label.description).toBe(
      "LFD · La Folie Coffee boutique · Commande n° 2030-00042 · paiement",
    );
    expect(labels.asked[0]?.label.metadata).toMatchObject({ channel: "shop" });
  });

  it("une saisie de l'équipe est la saisie staff, société ou pas", async () => {
    const labels = await deliver(
      owned({ view: view({ id: "ord_1", orderNumber: "2030-00042", origin: "back_office" }) }),
    );

    expect(labels.asked[0]?.label.description).toBe(
      "LFD · La Folie Coffee saisie staff · Commande n° 2030-00042 · paiement",
    );
    expect(labels.asked[0]?.label.metadata).toMatchObject({ channel: "staff" });
  });

  it("une commande sans intention (différée, au compte, gratuite) ne demande rien", async () => {
    expect((await deliver(owned({ stripePaymentIntentId: null }))).asked).toEqual([]);
  });

  it("une commande introuvable ne demande rien", async () => {
    expect((await deliver(null)).asked).toEqual([]);
  });

  it("aucun payeur ne part : le client est posé à la création", async () => {
    const labels = await deliver(owned());

    expect(labels.asked[0]?.label).not.toHaveProperty("payer");
  });
});
