import type { BillingAddressPayload } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import {
  CardOrderNotRevisableError,
  FrozenLinePriceChangedError,
  RevisionBelowVoucherError,
  RevisionFreesAccountOrderError,
  RevisionRequiresPaymentError,
  UnchangedOrderRevisionError,
} from "../../errors/order-revision-errors.js";
import type { OrderLineInput } from "../../value-objects/order-line.js";
import { Order, type DraftOrderInput } from "../order.js";
import type { RevisableOrder } from "../order-revision.js";

/**
 * **La révision d'une commande, jugée par l'agrégat** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1) : M1 ne sert
 * que le compte et le total nul, les prix déjà présents tiennent, le bon
 * imputé reste couvert, et une révision change quelque chose.
 *
 * Les jours de service sont des dates absolues comparées entre elles
 * seulement : aucune horloge ici (exception étroite du CLAUDE.md §5).
 */

const LABO: BillingAddressPayload = {
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const DAY = "2026-11-10";

const line = (sku: string, qty: number, priceCents = 200): OrderLineInput => ({
  sku,
  productName: sku,
  unitPriceMillicents: millicentsFromCents(priceCents),
  vatRate: 5.5,
  quantity: qty,
});

function input(over: Partial<DraftOrderInput> = {}): DraftOrderInput {
  return {
    companyId: "co_1",
    billedCompanyId: "co_1",
    principal: null,
    placedByStaffId: null,
    agreed: {
      window: { value: { start: "07:00", end: "08:00" }, source: "override" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    placedByUserId: "usr_1",
    fulfillment: {
      method: "pickup",
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddress: { ...LABO, siteId: "site_1" },
    },
    requestedDeliveryDate: new Date(`${DAY}T00:00:00.000Z`),
    note: "",
    catalogVersionId: null,
    lines: [line("VIE-001", 10)],
    discountCents: 0,
    discountAdjustment: null,
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    deliveryVatMode: "standard",
    voucher: null,
    salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
    locale: null,
    ...over,
  };
}

/** La commande telle que passée, d'après une entrée : au compte, 10 croissants par défaut. */
function placed(
  over: Partial<RevisableOrder> = {},
  from: DraftOrderInput = input(),
): RevisableOrder {
  const order = Order.draft(from);
  order.deferPayment();
  const state = order.toPersistence();
  return {
    orderId: "ord_1",
    orderNumber: "ORD-1",
    revision: 0,
    companyId: state.companyId,
    billedCompanyId: state.billedCompanyId,
    principal: null,
    placedByUserId: state.placedByUserId,
    placedByStaffId: null,
    status: "placed",
    paymentStatus: "not_required",
    totalCents: state.totalCents,
    stripePaymentIntentId: null,
    cancelledAt: null,
    refunds: { refundableCents: 0, inFlightCents: 0 },
    serviceDay: DAY,
    fulfillment: {
      method: state.fulfillmentMethod,
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddress: state.pickupAddress,
    },
    agreed: state.agreed,
    note: "",
    lines: state.lines,
    deliveryVatMode: state.deliveryVatMode,
    lateFeeAdjustment: null,
    voucher: null,
    salesTerms: state.salesTerms,
    locale: null,
    catalogVersionId: null,
    ...over,
  };
}

describe("Order.revise — ce que M1 sert", () => {
  it("révise une commande au compte : nouvelle révision, nouveau total, lignes changées", () => {
    const revision = Order.revise(placed(), input({ lines: [line("VIE-001", 20)] }));

    expect(revision).toMatchObject({
      fromRevision: 0,
      toRevision: 1,
      changes: ["lines"],
      routeChanged: false,
      onAccount: true,
    });
    // 20 × 2,00 € = 40,00 € HT ; TVA 5,5 % = 2,20 € ; total = 42,20 €.
    expect(revision.totalAfterCents).toBe(4_220);
    expect(revision.totalBeforeCents).toBe(2_110);
    expect(revision.state.paymentStatus).toBe("not_required");
  });

  it("refuse une commande dont la carte est attendue, avec la phrase de sortie", () => {
    const due = placed({ paymentStatus: "pending", stripePaymentIntentId: "pi_1" });

    expect(() => Order.revise(due, input({ lines: [line("VIE-001", 20)] }))).toThrow(
      CardOrderNotRevisableError,
    );
    expect(() => Order.revise(due, input({ lines: [line("VIE-001", 20)] }))).toThrow(
      "Commande réglée par carte : annulez-la et recommandez, ou demandez au commerce.",
    );
  });

  it("refuse une commande déjà payée par carte", () => {
    const paid = placed({ paymentStatus: "paid", stripePaymentIntentId: "pi_1" });

    expect(() => Order.revise(paid, input({ lines: [line("VIE-001", 20)] }))).toThrow(
      CardOrderNotRevisableError,
    );
  });

  it("refuse qu'une commande gratuite devienne payante : c'est une carte, donc M2", () => {
    const free = placed({}, input({ lines: [line("VIE-001", 10, 0)] }));

    expect(() =>
      Order.revise(free, input({ lines: [line("VIE-001", 10, 0), line("PAI-001", 1)] })),
    ).toThrow(RevisionRequiresPaymentError);
  });

  it("refuse qu'une commande au compte tombe à zéro", () => {
    expect(() => Order.revise(placed(), input({ lines: [line("PAI-001", 1, 0)] }))).toThrow(
      RevisionFreesAccountOrderError,
    );
  });
});

describe("Order.revise — R3, les prix figés", () => {
  it("refuse une ligne déjà présente qui n'a pas gardé son prix d'origine", () => {
    expect(() => Order.revise(placed(), input({ lines: [line("VIE-001", 12, 250)] }))).toThrow(
      FrozenLinePriceChangedError,
    );
  });

  it("laisse une ligne NOUVELLE à son prix du jour", () => {
    const revision = Order.revise(
      placed(),
      input({ lines: [line("VIE-001", 10), line("PAI-001", 1, 350)] }),
    );

    expect(revision.state.lines.map((entry) => entry.sku)).toEqual(["VIE-001", "PAI-001"]);
  });
});

describe("Order.revise — R6, une révision change quelque chose", () => {
  it("refuse une révision qui ne change rien", () => {
    expect(() => Order.revise(placed(), input())).toThrow(UnchangedOrderRevisionError);
  });

  it("le devis, lui, recompose un panier intact sans refuser", () => {
    expect(Order.recompose(placed(), input()).changes).toEqual([]);
  });

  it("nomme ce qui a changé, et dit quand l'acheminement a bougé", () => {
    const revision = Order.revise(
      placed(),
      input({
        requestedDeliveryDate: new Date("2026-11-11T00:00:00.000Z"),
        note: "Sonner deux fois",
      }),
    );

    expect(revision.changes).toEqual(["date", "note"]);
    expect(revision.routeChanged).toBe(true);
    expect(revision.previousServiceDay).toBe(DAY);
    expect(revision.serviceDay).toBe("2026-11-11");
  });

  it("ne voit pas de changement dans un point relu dans un autre ordre de clés", () => {
    const reordered = placed({
      fulfillment: {
        ...placed().fulfillment,
        pickupAddress: {
          siteId: "site_1",
          pays: LABO.pays,
          ville: LABO.ville,
          codePostal: LABO.codePostal,
          ligne2: LABO.ligne2,
          ligne1: LABO.ligne1,
          label: LABO.label,
        },
      },
    });

    expect(() => Order.revise(reordered, input())).toThrow(UnchangedOrderRevisionError);
  });
});

describe("Order.revise — §9, le bon de fidélité imputé", () => {
  /** Une commande personnelle, dont un bon de 15 € HT a couvert une part. */
  function personal(): { readonly order: RevisableOrder; readonly base: DraftOrderInput } {
    const base = input({
      companyId: null,
      billedCompanyId: null,
      salesTerms: { document: "salesTerms", revision: null, fileId: null },
      voucher: { id: "vch_1", valueCents: 1_500 },
    });
    const order = placed({ voucher: { id: "vch_1", appliedCents: 1_500 } }, base);
    return { order, base };
  }

  it("refuse une révision qui ferait passer le total sous le bon déjà déduit", () => {
    const { order, base } = personal();

    expect(() =>
      Order.revise(order, {
        ...base,
        lines: [line("VIE-001", 5)],
        voucher: { id: "vch_1", valueCents: order.voucher?.appliedCents ?? 0 },
      }),
    ).toThrow(RevisionBelowVoucherError);
  });

  it("garde le bon entier quand la commande grossit", () => {
    const { order, base } = personal();

    const revision = Order.revise(order, {
      ...base,
      lines: [line("VIE-001", 20)],
      voucher: { id: "vch_1", valueCents: order.voucher?.appliedCents ?? 0 },
    });

    expect(revision.state.voucherDiscountCents).toBe(1_500);
  });
});
