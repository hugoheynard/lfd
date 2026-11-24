import {
  EmptySubscriptionError,
  InvalidDateRangeError,
  InvalidRoutingError,
  SubscriptionAlreadyActiveError,
  SubscriptionAlreadyPausedError,
  SubscriptionCancelledError,
} from "../../errors/basket-errors.js";
import { Basket } from "../basket.js";
import { day, openBasket, PRO_TERMS } from "./basket-fixtures.js";

describe("Basket.open", () => {
  it("sort actif, servi (d'une société), avec les CGV acceptées et sans planification", () => {
    const basket = openBasket();
    expect(basket.currentStatus).toBe("active");
    expect(basket.isServed).toBe(true);
    expect(basket.salesTerms).toEqual(PRO_TERMS);
    expect(basket.plannedUntil).toBeNull();
  });

  it("refuse un panier sans ligne", () => {
    expect(() => openBasket({ lines: [] })).toThrow(EmptySubscriptionError);
  });

  it("refuse une fin avant le début", () => {
    expect(() => openBasket({ endDate: day("2026-11-01") })).toThrow(InvalidDateRangeError);
  });

  it("refuse une livraison sans adresse", () => {
    expect(() =>
      openBasket({
        routing: {
          method: "delivery",
          deliveryAddress: null,
          pickupAddressId: null,
          window: { start: null, end: "12:00" },
        },
      }),
    ).toThrow(InvalidRoutingError);
  });

  it("un panier perso n'est pas servi : aucune échéance ne lui sera créée", () => {
    expect(openBasket({ companyId: null }).isServed).toBe(false);
  });
});

describe("Basket — le cycle", () => {
  it("pause puis reprise ; chaque transition refuse sa répétition", () => {
    const basket = openBasket();
    basket.pause();
    expect(basket.isServed).toBe(false);
    expect(() => basket.pause()).toThrow(SubscriptionAlreadyPausedError);
    basket.resume();
    expect(basket.currentStatus).toBe("active");
    expect(() => basket.resume()).toThrow(SubscriptionAlreadyActiveError);
  });

  it("l'arrêt est sans retour, et un panier arrêté ne se mute plus", () => {
    const basket = openBasket();
    basket.cancel();
    expect(basket.lifecycle).toBe("cancelled");
    expect(basket.isServed).toBe(false);
    expect(() => basket.cancel()).toThrow(SubscriptionCancelledError);
    expect(() => basket.resume()).toThrow(SubscriptionCancelledError);
    expect(() => basket.decision()).toThrow(SubscriptionCancelledError);
  });

  it("la planification avance, et ne recule jamais", () => {
    const basket = openBasket();
    basket.plannedThrough(day("2027-01-10"));
    basket.plannedThrough(day("2026-12-01"));
    expect(basket.plannedUntil?.toString()).toBe("2027-01-10");
  });
});

describe("Basket.salesTermsOn — la version figée sur une échéance (plan § 7)", () => {
  const announced = Basket.reconstitute({
    ...openBasketInput(),
    status: "active",
    nextSalesTerms: { revision: 4, fileId: "file_cgv_4", effectiveOn: day("2026-12-15") },
    plannedUntil: null,
  });

  it("avant la date d'effet, l'échéance garde la version acceptée", () => {
    expect(announced.salesTermsOn(day("2026-12-14"))).toEqual(PRO_TERMS);
  });

  it("à partir de la date d'effet, la version annoncée", () => {
    expect(announced.salesTermsOn(day("2026-12-15"))).toEqual({
      key: "salesTermsPro",
      revision: 4,
      fileId: "file_cgv_4",
    });
  });

  it("sans version annoncée, toujours la version acceptée", () => {
    expect(openBasket().salesTermsOn(day("2030-01-01"))).toEqual(PRO_TERMS);
  });
});

function openBasketInput() {
  const basket = openBasket();
  return {
    id: basket.id,
    buyerUserId: basket.buyerUserId,
    companyId: basket.companyId,
    fromOrderId: basket.fromOrderId,
    cadence: basket.cadence,
    startDate: basket.startDate,
    endDate: basket.endDate,
    routing: basket.routing,
    note: basket.note,
    lines: basket.lines,
    salesTerms: basket.salesTerms,
  };
}

describe("Basket.announceSalesTerms — une nouvelle version publiée (plan § 7)", () => {
  it("note la version à venir, effective trente jours après l'envoi ; avant, l'ancienne s'applique", () => {
    const basket = openBasket();

    expect(
      basket.announceSalesTerms({ revision: 4, fileId: "file_cgv_4" }, day("2026-12-01")),
    ).toBe(true);

    expect(basket.nextSalesTerms).toEqual({
      revision: 4,
      fileId: "file_cgv_4",
      effectiveOn: day("2026-12-31"),
    });
    expect(basket.salesTermsOn(day("2026-12-30"))).toEqual(PRO_TERMS);
    expect(basket.salesTermsOn(day("2026-12-31"))).toMatchObject({ revision: 4 });
  });

  it("une version déjà annoncée, ou plus ancienne, n'annonce rien : un rejeu ne renvoie pas l'e-mail", () => {
    const basket = openBasket();
    basket.announceSalesTerms({ revision: 4, fileId: null }, day("2026-12-01"));

    expect(basket.announceSalesTerms({ revision: 4, fileId: null }, day("2026-12-02"))).toBe(false);
    expect(basket.announceSalesTerms({ revision: 2, fileId: null }, day("2026-12-02"))).toBe(false);
    expect(basket.nextSalesTerms?.effectiveOn).toEqual(day("2026-12-31"));
  });

  it("une annonce en préavis est remplacée, et la nouvelle repart pour trente jours", () => {
    const basket = openBasket();
    basket.announceSalesTerms({ revision: 4, fileId: null }, day("2026-12-01"));

    basket.announceSalesTerms({ revision: 5, fileId: null }, day("2026-12-10"));

    expect(basket.salesTerms).toEqual(PRO_TERMS);
    expect(basket.nextSalesTerms).toMatchObject({ revision: 5, effectiveOn: day("2027-01-09") });
  });

  it("une annonce entrée en vigueur devient la version appliquée avant la suivante", () => {
    const basket = openBasket();
    basket.announceSalesTerms({ revision: 4, fileId: "file_cgv_4" }, day("2026-12-01"));

    basket.announceSalesTerms({ revision: 5, fileId: null }, day("2027-02-01"));

    expect(basket.salesTerms).toEqual({ key: "salesTermsPro", revision: 4, fileId: "file_cgv_4" });
    expect(basket.nextSalesTerms).toMatchObject({ revision: 5 });
  });

  it("refuse un panier arrêté", () => {
    const basket = openBasket();
    basket.cancel();
    expect(() =>
      basket.announceSalesTerms({ revision: 4, fileId: null }, day("2026-12-01")),
    ).toThrow(SubscriptionCancelledError);
  });
});
