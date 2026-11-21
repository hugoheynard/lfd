import { orderPretaxCents } from "@lfd/money";
import { CommerceOrderPlacedFact } from "../../../../../delivery/channels/commerce/index.js";
import { IntentKeyReusedError } from "../../../../../platform/intent/intent-errors.js";
import { OrderTotalChangedError } from "../../../domain/errors/order-total-changed.error.js";
import { OrdersClosedForAudienceError } from "../../../domain/errors/orders-closed-for-audience.error.js";
import {
  CounterBuyerIsCompanyMemberError,
  CounterParticularDisabledError,
  CounterParticularNotFoundError,
  ShopTillOrderNotPickupError,
} from "../../../domain/errors/shop-till-order-errors.js";
import { OrderPlacedEvent } from "../../../domain/events/order-placed.event.js";
import { EstimateParticularOrderAtCounterQuery } from "../../queries/estimate-particular-order-at-counter.query.js";
import { PlaceParticularOrderAtCounterCommand } from "../place-particular-order-at-counter.command.js";
import {
  CROISSANT_TTC_CENTS,
  DISABLED,
  MEMBER,
  PARTICULAR,
  STAFF,
  counterPayload,
  counterScene,
} from "./counter-particular-scene.js";

/**
 * **La commande d'un particulier notée au comptoir**, réglée à la caisse de
 * la boutique (`commande-particulier-reglee-en-boutique.md`, § 4–5) :
 * la composition réelle, les ports doublés.
 */

const KEY = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const DELIVERY_ADDRESS = {
  label: "Maison",
  ligne1: "1 rue des Lilas",
  ligne2: "",
  codePostal: "75011",
  ville: "Paris",
  pays: "France",
};

describe("PlaceParticularOrderAtCounterHandler — la forme de la commande", () => {
  it("écrit une commande publique, au comptoir, à régler à la caisse de la boutique", async () => {
    const { handler, placed } = counterScene();

    const result = await handler.execute(
      new PlaceParticularOrderAtCounterCommand(STAFF, counterPayload(), KEY),
    );

    expect(result).toEqual({ id: "order_1", orderNumber: "ORD-1", totalCents: 400 });
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({
      companyId: null,
      clientele: "public",
      entryOrigin: "counter",
      placedByUserId: PARTICULAR,
      placedByStaffId: STAFF,
      buyerKind: "registered",
      paymentStatus: "not_required",
      settlementVenue: "shop_till",
      stripePaymentIntentId: null,
      loyaltyVoucherId: null,
      fulfillmentMethod: "pickup",
      totalCents: 2 * CROISSANT_TTC_CENTS,
    });
  });

  it("écrit le fait durable qui déclenche l'accusé, et publie la passation au nom du particulier", async () => {
    const { handler, durable, published, placed } = counterScene();

    const result = await handler.execute(
      new PlaceParticularOrderAtCounterCommand(STAFF, counterPayload(), KEY),
    );

    expect(durable.facts).toEqual([new CommerceOrderPlacedFact(result.id).durableFact()]);
    expect(published.published).toEqual([
      // Le HT de la commande écrite, par l'arithmétique unique ; un particulier.
      new OrderPlacedEvent(
        result.id,
        result.orderNumber,
        PARTICULAR,
        null,
        400,
        placed[0] === undefined ? -1 : orderPretaxCents(placed[0]),
        "public",
      ),
    ]);
  });

  it("chiffre comme l'estimation : même total, au centime", async () => {
    const { handler, estimator } = counterScene();
    const payload = counterPayload({ lines: [{ sku: "VIE-001", quantity: 3 }] });

    const estimate = await estimator.execute(
      new EstimateParticularOrderAtCounterQuery(STAFF, payload),
    );
    const placed = await handler.execute(
      new PlaceParticularOrderAtCounterCommand(
        STAFF,
        { ...payload, expectedTotalCents: estimate.amounts?.totalCents ?? -1 },
        KEY,
      ),
    );

    expect(estimate.refusal).toBeNull();
    expect(placed.totalCents).toBe(estimate.amounts?.totalCents);
  });

  it("refuse un total vu qui n'est plus celui du panier", async () => {
    const { handler, placed } = counterScene();

    await expect(
      handler.execute(
        new PlaceParticularOrderAtCounterCommand(
          STAFF,
          counterPayload({ expectedTotalCents: 1 }),
          KEY,
        ),
      ),
    ).rejects.toThrow(OrderTotalChangedError);
    expect(placed).toEqual([]);
  });
});

describe("PlaceParticularOrderAtCounterHandler — ce qu'elle refuse", () => {
  it("refuse la livraison, avant toute composition", async () => {
    const { handler, placed } = counterScene();

    await expect(
      handler.execute(
        new PlaceParticularOrderAtCounterCommand(
          STAFF,
          counterPayload({ fulfillmentMethod: "delivery", deliveryAddress: DELIVERY_ADDRESS }),
          KEY,
        ),
      ),
    ).rejects.toThrow(ShopTillOrderNotPickupError);
    expect(placed).toEqual([]);
  });

  it.each([
    [MEMBER, CounterBuyerIsCompanyMemberError],
    [DISABLED, CounterParticularDisabledError],
    ["usr_unknown", CounterParticularNotFoundError],
  ])("refuse la fiche %s, qui n'est pas un particulier", async (buyerUserId, error) => {
    const { handler, placed } = counterScene();

    await expect(
      handler.execute(
        new PlaceParticularOrderAtCounterCommand(STAFF, counterPayload({ buyerUserId }), KEY),
      ),
    ).rejects.toThrow(error);
    expect(placed).toEqual([]);
  });

  it("refuse quand la boutique est fermée aux particuliers", async () => {
    const { handler } = counterScene({ opening: { ordersOpenToB2c: false } });

    await expect(
      handler.execute(new PlaceParticularOrderAtCounterCommand(STAFF, counterPayload(), KEY)),
    ).rejects.toThrow(OrdersClosedForAudienceError);
  });

  it("l'estimation rend la fiche d'un membre de société en erreur, pas en refus de devis", async () => {
    const { estimator } = counterScene();

    await expect(
      estimator.execute(
        new EstimateParticularOrderAtCounterQuery(STAFF, counterPayload({ buyerUserId: MEMBER })),
      ),
    ).rejects.toThrow(CounterBuyerIsCompanyMemberError);
  });

  it("l'estimation rend la livraison en refus de devis, avec les mots de la passation", async () => {
    const { estimator } = counterScene();

    const view = await estimator.execute(
      new EstimateParticularOrderAtCounterQuery(
        STAFF,
        counterPayload({ fulfillmentMethod: "delivery", deliveryAddress: DELIVERY_ADDRESS }),
      ),
    );

    expect(view.amounts).toBeNull();
    expect(view.refusal?.code).toBe(new ShopTillOrderNotPickupError().code);
  });
});

describe("PlaceParticularOrderAtCounterHandler — une fois par intention", () => {
  it("rend la même commande au rejeu de la même clé, sans en écrire une seconde", async () => {
    const { handler, placed } = counterScene();
    const command = new PlaceParticularOrderAtCounterCommand(STAFF, counterPayload(), KEY);

    const first = await handler.execute(command);
    const again = await handler.execute(command);

    expect(again).toEqual(first);
    expect(placed).toHaveLength(1);
  });

  it("refuse la même clé sur un autre panier", async () => {
    const { handler } = counterScene();
    await handler.execute(new PlaceParticularOrderAtCounterCommand(STAFF, counterPayload(), KEY));

    await expect(
      handler.execute(
        new PlaceParticularOrderAtCounterCommand(
          STAFF,
          counterPayload({ lines: [{ sku: "VIE-001", quantity: 5 }], expectedTotalCents: 1000 }),
          KEY,
        ),
      ),
    ).rejects.toThrow(IntentKeyReusedError);
  });

  it("rend la clé après un refus : le renvoi corrigé passe", async () => {
    const { handler, placed } = counterScene();
    await expect(
      handler.execute(
        new PlaceParticularOrderAtCounterCommand(
          STAFF,
          counterPayload({ expectedTotalCents: 1 }),
          KEY,
        ),
      ),
    ).rejects.toThrow(OrderTotalChangedError);

    await handler.execute(new PlaceParticularOrderAtCounterCommand(STAFF, counterPayload(), KEY));

    expect(placed).toHaveLength(1);
  });
});
