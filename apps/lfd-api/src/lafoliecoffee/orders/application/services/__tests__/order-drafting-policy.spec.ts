import type { AdminOrderEstimatePayload } from "@lfd/contracts";

import { OrderCutoffGraceError } from "../../../domain/errors/order-errors.js";
import { REGISTERED_BUYER } from "../../../domain/value-objects/order-buyer-kind.js";
import { backorderPolicyOf } from "../../../backorder/application/backorder-placement.js";
import {
  BUYER,
  COMPANY,
  draftingIn,
  LATE_FEE_CENTS,
  quotePayload,
  STAFF,
} from "../../../backorder/application/__tests__/backorder-conversion-scene.js";
import { originReplay } from "../../../backorder/application/__tests__/backorder-conversion-doubles.js";
import { backorderReplayOf } from "../../../backorder/domain/services/backorder-replay.js";
import { BackorderLine } from "../../../backorder/domain/value-objects/backorder-line.js";
import { PLACEMENT_POLICY, type DraftPolicy } from "../order-drafting.service.js";
import type { OrderParties } from "../order-parties.js";

/**
 * **`OrderDrafting` sous ses politiques** (`documentation/commandes/reliquat/reliquat.md`, § 6.3) : la
 * passation ordinaire ne change pas — prix du jour, surtaxe d'une dérogation
 * dépensée, port de la zone ; la politique du reliquat rejoue le prix
 * d'origine, dépense la dérogation sans surtaxe, et offre le port.
 */

const PARTIES: OrderParties = {
  companyId: COMPANY,
  placedByUserId: BUYER,
  placedByStaffId: STAFF,
  buyerKind: REGISTERED_BUYER,
  exceedItemLimits: false,
  minimumsWaived: true,
};

function content(over: Partial<AdminOrderEstimatePayload> = {}): AdminOrderEstimatePayload {
  return {
    ...quotePayload(),
    companyId: COMPANY,
    lines: [{ sku: "PAI-001", quantity: 4, saleUnit: "piece" }],
    ...over,
  };
}

const DELIVERED: Partial<AdminOrderEstimatePayload> = {
  fulfillmentMethod: "delivery",
  pickupAddressId: null,
  deliveryAddressId: "addr_bistrot",
  deliveryAddress: {
    label: "",
    ligne1: "2 rue du Test",
    ligne2: "",
    codePostal: "75002",
    ville: "Paris",
    pays: "France",
  },
};

const BACKORDER_POLICY: DraftPolicy = backorderPolicyOf(
  backorderReplayOf(originReplay(), [
    BackorderLine.of({ sku: "PAI-001", quantity: 4, saleUnit: "piece" }),
  ]),
);

async function drafted(
  policy: DraftPolicy,
  options: { readonly late?: boolean; readonly waiver?: boolean; readonly lateFee?: boolean },
  over: Partial<AdminOrderEstimatePayload> = {},
) {
  return draftingIn(options).draft(
    PARTIES,
    content(over),
    null,
    null,
    "checkout",
    undefined,
    undefined,
    null,
    policy,
  );
}

describe("OrderDrafting — la passation ordinaire ne change pas (non-régression)", () => {
  /**
   * Calculé à la main : 4 pains au prix du jour, 4,00 € HT = 16,00 € ; TVA
   * 5,5 % = 0,88 € ; aucun port en retrait : 16,88 €.
   */
  it("avant l'heure, en retrait : le prix du jour, au centime", async () => {
    const { order, waiverUsed } = await drafted(PLACEMENT_POLICY, {});
    order.deferPayment();
    const state = order.toPersistence();

    expect(state.subtotalCents).toBe(1_600);
    expect(state.vatCents).toBe(88);
    expect(state.totalCents).toBe(1_688);
    expect(state.lateFeeCents).toBe(0);
    expect(state.deliveryOffered).toBe(false);
    expect(waiverUsed).toBeNull();
  });

  it("après l'heure, avec dérogation et réglage : la dérogation se dépense ET la surtaxe s'applique", async () => {
    const { order, waiverUsed } = await drafted(PLACEMENT_POLICY, {
      late: true,
      waiver: true,
      lateFee: true,
    });

    expect(waiverUsed).toBe("w_1");
    expect(order.amounts().lateFeeCents).toBe(LATE_FEE_CENTS);
  });

  it("livrée dans une zone à frais : le port de la zone est facturé", async () => {
    const { order } = await drafted(PLACEMENT_POLICY, {}, DELIVERED);

    expect(order.amounts().deliveryFeeCents).toBe(800);
    expect(order.deliveryOffered).toBe(false);
  });
});

describe("OrderDrafting — sous la politique du reliquat", () => {
  it("après l'heure, avec dérogation et réglage : la dérogation se dépense, AUCUNE surtaxe", async () => {
    const { order, waiverUsed } = await drafted(BACKORDER_POLICY, {
      late: true,
      waiver: true,
      lateFee: true,
    });

    expect(waiverUsed).toBe("w_1");
    expect(order.amounts().lateFeeCents).toBe(0);
  });

  it("le prix unitaire d'origine, pas celui du catalogue d'aujourd'hui", async () => {
    const { order } = await drafted(BACKORDER_POLICY, {});

    expect(order.amounts().subtotalCents).toBe(1_200);
  });

  it("livrée dans une zone à frais : port nul, livraison offerte, drapeau posé", async () => {
    const { order } = await drafted(BACKORDER_POLICY, {}, DELIVERED);

    expect(order.amounts().deliveryFeeCents).toBe(0);
    expect(order.deliveryOffered).toBe(true);
  });

  // La dérogation est la clé de la porte, la surtaxe son prix : lever le prix
  // ne doit pas donner la clé. Sans dérogation, la commande en retard reste
  // refusée même sous la politique qui ne facture pas la surtaxe.
  it("après l'heure SANS dérogation : refusée, la surtaxe levée n'ouvre pas la porte", async () => {
    await expect(
      drafted(BACKORDER_POLICY, { late: true, waiver: false, lateFee: true }),
    ).rejects.toBeInstanceOf(OrderCutoffGraceError);
  });

  it("avant l'heure, avec un réglage de surtaxe : aucune surtaxe, aucune dérogation dépensée", async () => {
    const { order, waiverUsed } = await drafted(BACKORDER_POLICY, { waiver: true, lateFee: true });

    expect(order.amounts().lateFeeCents).toBe(0);
    expect(waiverUsed).toBeNull();
  });

  // Rien à offrir en retrait (décision 16) : le drapeau est posé quand même,
  // pour qu'une révision vers la livraison trouve le port offert.
  it("en retrait : drapeau posé, aucun port, aucune livraison offerte figée", async () => {
    const { order } = await drafted(BACKORDER_POLICY, {});
    order.deferPayment();
    const state = order.toPersistence();

    expect(state.deliveryOffered).toBe(true);
    expect(state.deliveryFeeCents).toBe(0);
    expect(state.freeDelivery).toBeNull();
  });
});

describe("OrderDrafting — surtaxe : les deux réglages de la politique", () => {
  const WAIVING: DraftPolicy = { ...PLACEMENT_POLICY, lateFee: "waive" };

  it("« waive » sans le reliquat ne pose ni port offert ni rejeu : seule la surtaxe change", async () => {
    const { order } = await drafted(
      WAIVING,
      { late: true, waiver: true, lateFee: true },
      DELIVERED,
    );

    expect(order.amounts().lateFeeCents).toBe(0);
    expect(order.amounts().deliveryFeeCents).toBe(800);
    expect(order.deliveryOffered).toBe(false);
  });

  it("« apply » avant l'heure, avec un réglage : pas de surtaxe, le verdict n'en pose pas", async () => {
    const { order } = await drafted(PLACEMENT_POLICY, { waiver: true, lateFee: true });

    expect(order.amounts().lateFeeCents).toBe(0);
  });

  it("« apply » après l'heure, dérogation mais SANS réglage de surtaxe : aucune surtaxe", async () => {
    const { order, waiverUsed } = await drafted(PLACEMENT_POLICY, { late: true, waiver: true });

    expect(waiverUsed).toBe("w_1");
    expect(order.amounts().lateFeeCents).toBe(0);
  });
});
