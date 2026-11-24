import {
  type BasketViewRow,
  type OccurrenceViewRow,
  toAdminOccurrences,
  toSubscriptionView,
} from "../basket-view.mapper.js";

const SETTLED = new Date("2026-11-09T05:00:00.000Z");

function occurrence(overrides: Partial<OccurrenceViewRow> = {}): OccurrenceViewRow {
  return {
    serviceDay: new Date("2026-11-16T00:00:00.000Z"),
    state: "planned",
    lines: null,
    note: "",
    orderId: null,
    cause: null,
    reason: null,
    settledAt: null,
    ...overrides,
  };
}

function row(occurrences: readonly OccurrenceViewRow[], overrides: Partial<BasketViewRow> = {}) {
  const base: BasketViewRow = {
    id: "basket_1",
    buyerUserId: "user_1",
    cadence: "weekly",
    status: "active",
    startDate: new Date("2026-11-02T00:00:00.000Z"),
    endDate: null,
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    pickupAddressId: "point_1",
    requestedWindow: { start: "08:00", end: "10:00" },
    note: "",
    salesTermsKey: "salesTermsPro",
    salesTermsRevision: 3,
    salesTermsNextRevision: null,
    salesTermsEffectiveOn: null,
    createdAt: new Date("2026-11-01T10:00:00.000Z"),
    lines: [{ sku: "PAN-001", quantity: 4 }],
    occurrences,
  };
  return { ...base, ...overrides };
}

const REFUSED = occurrence({
  state: "refused",
  cause: "unavailable_sku",
  reason: "Le pain de campagne n'est plus vendu.",
  settledAt: SETTLED,
});

describe("toSubscriptionView", () => {
  it("une échéance sans dérogation porte les lignes du gabarit, non dérogée", () => {
    const view = toSubscriptionView(row([occurrence()]));

    expect(view.occurrences).toEqual([
      {
        serviceDay: "2026-11-16",
        state: "planned",
        lines: [{ sku: "PAN-001", quantity: 4 }],
        overridden: false,
        note: "",
        orderId: null,
      },
    ]);
  });

  it("une échéance dérogée porte ses propres lignes et sa note", () => {
    const view = toSubscriptionView(
      row([occurrence({ lines: [{ sku: "CRO-002", quantity: 6 }], note: "Pour la fête" })]),
    );

    expect(view.occurrences[0]).toMatchObject({
      lines: [{ sku: "CRO-002", quantity: 6 }],
      overridden: true,
      note: "Pour la fête",
    });
  });

  it("une échéance passée nomme sa commande", () => {
    const view = toSubscriptionView(
      row([occurrence({ state: "placed", orderId: "order_1", settledAt: SETTLED })]),
    );

    expect(view.occurrences[0]).toMatchObject({ state: "placed", orderId: "order_1" });
  });

  it("le client ne voit d'un refus que l'état : ni cause, ni phrase, ni heure", () => {
    const view = toSubscriptionView(row([REFUSED, occurrence({ ...REFUSED, state: "missed" })]));

    for (const seen of view.occurrences) {
      expect(Object.keys(seen).sort()).toEqual(
        ["lines", "note", "orderId", "overridden", "serviceDay", "state"].sort(),
      );
    }
    expect(view.occurrences.map((seen) => seen.state)).toEqual(["refused", "missed"]);
  });

  it("dit la version des CGV appliquée, et la version annoncée avec sa date d'effet", () => {
    const plain = toSubscriptionView(row([]));
    const announced = toSubscriptionView(
      row([], {
        salesTermsNextRevision: 4,
        salesTermsEffectiveOn: new Date("2026-12-24T00:00:00.000Z"),
      }),
    );

    expect(plain.salesTerms).toEqual({ document: "salesTermsPro", revision: 3 });
    expect(plain.nextSalesTerms).toBeNull();
    expect(announced.nextSalesTerms).toEqual({ revision: 4, effectiveOn: "2026-12-24" });
  });
});

describe("toAdminOccurrences", () => {
  it("le staff voit la cause, la phrase et l'heure de l'issue", () => {
    expect(toAdminOccurrences(row([REFUSED]))).toEqual([
      expect.objectContaining({
        state: "refused",
        cause: "unavailable_sku",
        reason: "Le pain de campagne n'est plus vendu.",
        settledAt: SETTLED.toISOString(),
      }),
    ]);
  });

  it("une échéance sans issue n'a ni cause ni heure", () => {
    expect(toAdminOccurrences(row([occurrence()]))[0]).toMatchObject({
      cause: null,
      reason: null,
      settledAt: null,
    });
  });
});
