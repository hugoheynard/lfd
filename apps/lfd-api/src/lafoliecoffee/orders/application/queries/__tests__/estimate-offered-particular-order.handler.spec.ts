import type { OfferedParticularOrderEstimatePayload } from "@lfd/contracts";

import {
  CounterBuyerIsCompanyMemberError,
  CounterParticularNotFoundError,
} from "../../../domain/errors/shop-till-order-errors.js";
import {
  CROISSANT_TTC_CENTS,
  MEMBER,
  STAFF,
  counterPayload,
  counterScene,
} from "../../commands/__tests__/counter-particular-scene.js";
import { PlaceOfferedParticularOrderCommand } from "../../commands/place-offered-particular-order.command.js";
import { EstimateOfferedParticularOrderQuery } from "../estimate-offered-particular-order.query.js";

/**
 * **L'estimation de la commande offerte à un particulier**
 * (`la-commande-offerte.md`, § 2.10) : la préparation de la passation,
 * lue sans écrire.
 */

const OFFER = { nature: "tasting", note: "Dégustation au salon", notifyCustomer: false } as const;

function estimatePayload(
  over: Partial<OfferedParticularOrderEstimatePayload> = {},
): OfferedParticularOrderEstimatePayload {
  const { expectedTotalCents: _seen, ...content } = counterPayload();
  return { ...content, offer: OFFER, ...over };
}

function estimating(
  over: Partial<OfferedParticularOrderEstimatePayload> = {},
): EstimateOfferedParticularOrderQuery {
  return new EstimateOfferedParticularOrderQuery(STAFF, estimatePayload(over));
}

describe("EstimateOfferedParticularOrderHandler", () => {
  it("avec le motif : total nul, et la valeur offerte TTC", async () => {
    const { offerEstimator } = counterScene();

    const view = await offerEstimator.execute(estimating());

    expect(view.refusal).toBeNull();
    expect(view.amounts?.totalCents).toBe(0);
    expect(view.amounts?.offeredTotalCents).toBe(2 * CROISSANT_TTC_CENTS);
  });

  it("sans motif : la valeur pleine, sans valeur offerte", async () => {
    const { offerEstimator } = counterScene();

    const { offer: _none, ...withoutOffer } = estimatePayload();
    const view = await offerEstimator.execute(
      new EstimateOfferedParticularOrderQuery(STAFF, withoutOffer),
    );

    expect(view.amounts?.totalCents).toBe(2 * CROISSANT_TTC_CENTS);
    expect(view.amounts?.offeredTotalCents).toBeUndefined();
  });

  it("chiffre ce que la passation écrit : la même valeur offerte", async () => {
    const { offerEstimator, offerer } = counterScene();

    const view = await offerEstimator.execute(estimating());
    const placed = await offerer.execute(
      new PlaceOfferedParticularOrderCommand(
        STAFF,
        { ...estimatePayload(), offer: OFFER, expectedTotalCents: view.amounts?.totalCents ?? -1 },
        "3f2504e0-4f89-41d3-9a0c-0305e82c3303",
        true,
      ),
    );

    expect(placed.offeredTotalCents).toBe(view.amounts?.offeredTotalCents);
  });

  it("n'écrit rien : ni commande, ni fait", async () => {
    const { offerEstimator, placed, durable } = counterScene();

    await offerEstimator.execute(estimating());

    expect(placed).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("rend une livraison non desservie en refus de devis, pas en erreur", async () => {
    const { offerEstimator } = counterScene();

    const view = await offerEstimator.execute(
      estimating({
        fulfillmentMethod: "delivery",
        pickupAddressId: null,
        requestedWindow: undefined,
        deliveryAddress: {
          label: "Maison",
          ligne1: "1 rue des Lilas",
          ligne2: "",
          codePostal: "75011",
          ville: "Paris",
          pays: "France",
        },
      }),
    );

    expect(view.amounts).toBeNull();
    expect(view.refusal?.code).toEqual(expect.any(String));
  });

  it.each([
    [MEMBER, CounterBuyerIsCompanyMemberError],
    ["usr_absent", CounterParticularNotFoundError],
  ])("rend la fiche %s en erreur, comme la passation", async (buyerUserId, refusal) => {
    const { offerEstimator } = counterScene();

    await expect(offerEstimator.execute(estimating({ buyerUserId }))).rejects.toBeInstanceOf(
      refusal,
    );
  });
});
