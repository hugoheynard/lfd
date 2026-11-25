import type { BillingAddressPayload, CartAdjustment } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import {
  OfferedDeliveryChargedError,
  OfferedDeliveryTooLateError,
} from "../../errors/offered-delivery-errors.js";
import type { OrderLineInput } from "../../value-objects/order-line.js";
import { Order } from "../order.js";
import { placed } from "../../../revision/domain/entities/__tests__/revisable-order.fixture.js";
import { draftFrom, replayedOf, type DraftSpec } from "./priced-input.fixture.js";

/**
 * **Le port offert, gardé par l'agrégat** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`,
 * décisions 7, 14 et 16) : posé à la composition, il exige un port nul — HT
 * comme TTC —, image du CHECK `orders_delivery_offered_waives_fee` ; une
 * révision d'une commande au port offert le rejuge.
 */

const ADDRESS: BillingAddressPayload = {
  label: "",
  ligne1: "2 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const FEE: CartAdjustment = { mode: "amount", cents: 1_200 };

const LINE: OrderLineInput = {
  sku: "VIE-001",
  productName: "Croissant",
  unitPriceMillicents: millicentsFromCents(200),
  vatRate: 5.5,
  saleUnit: "piece",
  quantity: 10,
};

const DELIVERED: DraftSpec = {
  companyId: "co_1",
  billedCompanyId: "co_1",
  principal: null,
  placedByStaffId: "staff_1",
  buyerKind: "registered",
  agreed: {
    window: { value: null, source: "default" },
    contact: { value: null, source: "default" },
    signatureRequired: { value: false, source: "default" },
  },
  placedByUserId: "usr_1",
  fulfillment: {
    method: "delivery",
    deliveryZoneId: "zone_1",
    deliveryAddress: ADDRESS,
    deliveryAddressId: null,
    pickupAddress: null,
  },
  requestedDeliveryDate: null,
  note: "",
  catalogVersionId: null,
  lines: [LINE],
  deliveryFee: FEE,
  voucher: null,
  salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
  locale: null,
};

const PICKED_UP: DraftSpec = {
  ...DELIVERED,
  fulfillment: {
    method: "pickup",
    deliveryZoneId: null,
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddress: {
      label: "Labo",
      ligne1: "1 rue du Four",
      ligne2: "",
      codePostal: "73000",
      ville: "Chambéry",
      pays: "France",
    },
  },
};

describe("Order.offerDelivery — à la passation", () => {
  it("franco à 0 : port nul, drapeau posé et persisté", () => {
    const order = Order.draft(draftFrom(DELIVERED, { freeDeliveryThresholdCents: 0 }));

    order.offerDelivery();
    order.deferPayment();
    const state = order.toPersistence();

    expect(state.deliveryOffered).toBe(true);
    expect(state.deliveryFeeCents).toBe(0);
    expect(state.freeDelivery?.waivedCents).toBe(1_200);
  });

  it("en retrait : posé aussi (décision 16), rien à offrir", () => {
    const order = Order.draft(draftFrom(PICKED_UP));

    order.offerDelivery();
    order.deferPayment();

    expect(order.toPersistence().deliveryOffered).toBe(true);
  });

  it("un port facturé : refusé avec son nom, pas en 500 par la base", () => {
    const order = Order.draft(draftFrom(DELIVERED, { freeDeliveryThresholdCents: null }));

    expect(() => order.offerDelivery()).toThrow(OfferedDeliveryChargedError);
    expect(order.deliveryOffered).toBe(false);
  });

  it("le TTC d'un particulier compte aussi", () => {
    const personal = Order.draft(
      draftFrom(
        { ...DELIVERED, companyId: null, billedCompanyId: null },
        {
          freeDeliveryThresholdCents: null,
        },
      ),
    );

    expect(() => personal.offerDelivery()).toThrow(OfferedDeliveryChargedError);
  });

  it("après le règlement décidé : trop tard", () => {
    const order = Order.draft(draftFrom(DELIVERED, { freeDeliveryThresholdCents: 0 }));
    order.deferPayment();

    expect(() => order.offerDelivery()).toThrow(OfferedDeliveryTooLateError);
  });

  // Un geste rejoué ne doit pas changer d'avis : poser deux fois, c'est poser une fois.
  it("posé deux fois : même état, aucun refus", () => {
    const order = Order.draft(draftFrom(DELIVERED, { freeDeliveryThresholdCents: 0 }));

    order.offerDelivery();
    order.offerDelivery();

    expect(order.deliveryOffered).toBe(true);
  });

  it("une commande ordinaire ne le porte pas", () => {
    const order = Order.draft(draftFrom(DELIVERED));
    order.deferPayment();

    expect(order.toPersistence().deliveryOffered).toBe(false);
  });
});

describe("Order.recompose — une commande au port offert", () => {
  const current = placed({ deliveryOffered: true }, draftFrom(PICKED_UP));

  it("passée en livraison avec le seuil 0 du chargement : port nul, drapeau reconduit", () => {
    const { revision } = Order.recompose(
      current,
      draftFrom(DELIVERED, { freeDeliveryThresholdCents: 0, replayed: replayedOf(current) }),
    );

    expect(revision.state.deliveryFeeCents).toBe(0);
    expect(revision.state.deliveryOffered).toBe(true);
  });

  it("un chargement qui oublierait le seuil 0 est refusé : jamais un port facturé en silence", () => {
    expect(() =>
      Order.recompose(
        current,
        draftFrom(DELIVERED, { freeDeliveryThresholdCents: null, replayed: replayedOf(current) }),
      ),
    ).toThrow(OfferedDeliveryChargedError);
  });

  // Non-régression : une commande ordinaire recomposée sans franco continue de
  // facturer son port, et ne gagne pas le drapeau.
  it("une commande SANS le drapeau garde son port facturé et ne le gagne pas", () => {
    const ordinary = placed({}, draftFrom(PICKED_UP));

    const { revision } = Order.recompose(
      ordinary,
      draftFrom(DELIVERED, { freeDeliveryThresholdCents: null, replayed: replayedOf(ordinary) }),
    );

    expect(revision.state.deliveryFeeCents).toBe(1_200);
    expect(revision.state.deliveryOffered).toBe(false);
  });

  // La modification du client passe par `revise`, pas par `recompose` seul : le
  // drapeau se relit sur ce chemin-là aussi.
  it("par `revise` (le geste de modification) : même port nul, même drapeau", () => {
    const { revision } = Order.revise(
      current,
      draftFrom(DELIVERED, { freeDeliveryThresholdCents: 0, replayed: replayedOf(current) }),
      "staff",
    );

    expect(revision.state.deliveryFeeCents).toBe(0);
    expect(revision.state.deliveryOffered).toBe(true);
  });

  it("restée en retrait : drapeau reconduit, aucun port", () => {
    const { revision } = Order.recompose(
      current,
      draftFrom({ ...PICKED_UP, note: "autre" }, { replayed: replayedOf(current) }),
    );

    expect(revision.state.deliveryOffered).toBe(true);
    expect(revision.state.deliveryFeeCents).toBe(0);
  });
});
