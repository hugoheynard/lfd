import type { OfferedParticularOrderPayload } from "@lfd/contracts";

import { CommerceOrderPlacedFact } from "../../../../../delivery/channels/commerce/index.js";
import { OfferNotPermittedError } from "../../../domain/errors/order-offer-errors.js";
import {
  CounterBuyerIsCompanyMemberError,
  CounterParticularDisabledError,
  CounterParticularNotFoundError,
} from "../../../domain/errors/shop-till-order-errors.js";
import { OrderOfferedEvent } from "../../../domain/events/order-offered.event.js";
import { PlaceOfferedParticularOrderCommand } from "../place-offered-particular-order.command.js";
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
 * **La commande offerte à un particulier** (`la-commande-offerte.md`,
 * § 2.5) : le mur du comptoir, la composition réelle, les gestes de
 * l'offre partagés avec la saisie pour une société.
 */

const KEY = "3f2504e0-4f89-41d3-9a0c-0305e82c3302";

function offeredPayload(
  over: Partial<OfferedParticularOrderPayload> = {},
): OfferedParticularOrderPayload {
  return {
    ...counterPayload(),
    offer: { nature: "event", note: "Dégustation pour un mariage", notifyCustomer: false },
    expectedTotalCents: 0,
    ...over,
  };
}

function offering(
  over: Partial<OfferedParticularOrderPayload> = {},
  mayOffer = true,
  key = KEY,
): PlaceOfferedParticularOrderCommand {
  return new PlaceOfferedParticularOrderCommand(STAFF, offeredPayload(over), key, mayOffer);
}

describe("PlaceOfferedParticularOrderHandler — la commande", () => {
  it("écrit une commande publique sans société, offerte : total nul, rien à encaisser", async () => {
    const { offerer, placed } = counterScene();

    const result = await offerer.execute(offering());

    expect(result).toEqual({
      id: "order_1",
      orderNumber: "ORD-1",
      totalCents: 0,
      offeredTotalCents: 2 * CROISSANT_TTC_CENTS,
    });
    expect(placed[0]).toMatchObject({
      companyId: null,
      clientele: "public",
      entryOrigin: "commercial",
      placedByUserId: PARTICULAR,
      placedByStaffId: STAFF,
      buyerKind: "registered",
      paymentStatus: "not_required",
      settlementVenue: null,
      stripePaymentIntentId: null,
      totalCents: 0,
    });
    expect(placed[0]?.offer?.reason).toEqual({
      nature: "event",
      note: "Dégustation pour un mariage",
      notifyCustomer: false,
    });
  });

  it("écrit le témoin `order.offered` au nom du particulier, avec l'accusé", async () => {
    const { offerer, durable } = counterScene();

    const result = await offerer.execute(offering());

    expect(durable.facts).toEqual([
      new CommerceOrderPlacedFact(result.id).durableFact(),
      new OrderOfferedEvent(
        result.id,
        result.orderNumber,
        PARTICULAR,
        STAFF,
        "event",
        2 * CROISSANT_TTC_CENTS,
        0,
      ).durableFact(),
    ]);
  });

  it("rend la même commande à un double clic, sans en écrire une seconde", async () => {
    const { offerer, placed } = counterScene();

    const first = await offerer.execute(offering());
    const again = await offerer.execute(offering());

    expect(again).toEqual(first);
    expect(placed).toHaveLength(1);
  });
});

describe("PlaceOfferedParticularOrderHandler — les refus", () => {
  it("🔴 refuse sans le droit d'offrir, sans consommer la clé", async () => {
    const { offerer, placed } = counterScene();

    await expect(offerer.execute(offering({}, false))).rejects.toBeInstanceOf(
      OfferNotPermittedError,
    );
    expect(placed).toEqual([]);
    // La même clé repasse une fois le droit accordé.
    await expect(offerer.execute(offering())).resolves.toMatchObject({ totalCents: 0 });
  });

  it.each([
    [MEMBER, CounterBuyerIsCompanyMemberError],
    [DISABLED, CounterParticularDisabledError],
    ["usr_absent", CounterParticularNotFoundError],
  ])("refuse la fiche %s : ce n'est pas un particulier", async (buyerUserId, refusal) => {
    const { offerer, placed, durable } = counterScene();

    await expect(offerer.execute(offering({ buyerUserId }))).rejects.toBeInstanceOf(refusal);
    expect(placed).toEqual([]);
    expect(durable.facts).toEqual([]);
  });
});
