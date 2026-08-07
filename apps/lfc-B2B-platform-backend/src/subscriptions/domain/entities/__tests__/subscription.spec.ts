import type { BillingAddressPayload } from "@lfd/contracts";

import {
  EmptyOverrideError,
  EmptySubscriptionError,
  InvalidDateRangeError,
  InvalidRoutingError,
  OccurrenceOutsideWindowError,
  SubscriptionAlreadyActiveError,
  SubscriptionAlreadyPausedError,
} from "../../errors/subscription-errors.js";
import { IsoDate } from "../../value-objects/iso-date.js";
import { SubscriptionLine } from "../../value-objects/subscription-line.js";
import { Subscription, type OpenSubscriptionInput } from "../subscription.js";

const ADDRESS: BillingAddressPayload = {
  label: "",
  ligne1: "1 rue du Test",
  ligne2: "",
  codePostal: "73000",
  ville: "Chambéry",
  pays: "France",
};

const line = (sku: string, qty: number): SubscriptionLine => SubscriptionLine.create(sku, qty);

function openInput(overrides: Partial<OpenSubscriptionInput> = {}): OpenSubscriptionInput {
  return {
    placedByUserId: "user_1",
    fromOrderId: null,
    recurrence: "weekly",
    startDate: IsoDate.fromString("2026-08-10"),
    endDate: IsoDate.fromString("2026-12-10"),
    routing: { method: "pickup", deliveryAddress: null, pickupAddressId: null },
    note: "",
    lines: [line("SKU-1", 2)],
    ...overrides,
  };
}

describe("Subscription.open", () => {
  it("ouvre un panier actif et sérialise son état", () => {
    const state = Subscription.open(openInput()).toPersistence();
    expect(state.id).toBeNull();
    expect(state.status).toBe("active");
    expect(state.lines).toEqual([{ sku: "SKU-1", quantity: 2 }]);
    expect(state.startDate.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("refuse un panier sans ligne", () => {
    expect(() => Subscription.open(openInput({ lines: [] }))).toThrow(EmptySubscriptionError);
  });

  it("refuse une date de fin antérieure au début", () => {
    expect(() =>
      Subscription.open(
        openInput({
          startDate: IsoDate.fromString("2026-08-10"),
          endDate: IsoDate.fromString("2026-08-09"),
        }),
      ),
    ).toThrow(InvalidDateRangeError);
  });

  it("accepte une fin égale au début (borne)", () => {
    expect(() =>
      Subscription.open(
        openInput({
          startDate: IsoDate.fromString("2026-08-10"),
          endDate: IsoDate.fromString("2026-08-10"),
        }),
      ),
    ).not.toThrow();
  });

  it("accepte une fin nulle (sans fin)", () => {
    const state = Subscription.open(openInput({ endDate: null })).toPersistence();
    expect(state.endDate).toBeNull();
  });

  describe("acheminement", () => {
    it("livraison : exige une adresse et vide le point de retrait résiduel", () => {
      const state = Subscription.open(
        openInput({
          routing: { method: "delivery", deliveryAddress: ADDRESS, pickupAddressId: "pickup_x" },
        }),
      ).toPersistence();
      expect(state.deliveryAddress).toEqual(ADDRESS);
      expect(state.pickupAddressId).toBeNull();
    });

    it("livraison sans adresse : refus", () => {
      expect(() =>
        Subscription.open(
          openInput({
            routing: { method: "delivery", deliveryAddress: null, pickupAddressId: null },
          }),
        ),
      ).toThrow(InvalidRoutingError);
    });

    it("retrait : vide toute adresse de livraison résiduelle", () => {
      const state = Subscription.open(
        openInput({
          routing: { method: "pickup", deliveryAddress: ADDRESS, pickupAddressId: "pickup_x" },
        }),
      ).toPersistence();
      expect(state.deliveryAddress).toBeNull();
      expect(state.pickupAddressId).toBe("pickup_x");
    });
  });
});

describe("Subscription — transitions d'état", () => {
  it("pause un panier actif", () => {
    const sub = Subscription.open(openInput());
    sub.pause();
    expect(sub.toPersistence().status).toBe("paused");
  });

  it("refuse de mettre en pause un panier déjà en pause", () => {
    const sub = Subscription.open(openInput());
    sub.pause();
    expect(() => sub.pause()).toThrow(SubscriptionAlreadyPausedError);
  });

  it("reprend un panier en pause", () => {
    const sub = Subscription.open(openInput());
    sub.pause();
    sub.resume();
    expect(sub.toPersistence().status).toBe("active");
  });

  it("refuse de reprendre un panier déjà actif", () => {
    const sub = Subscription.open(openInput());
    expect(() => sub.resume()).toThrow(SubscriptionAlreadyActiveError);
  });
});

describe("Subscription.overrideOccurrence", () => {
  const inWindow = IsoDate.fromString("2026-09-01");

  it("enregistre un saut (aucune ligne)", () => {
    const sub = Subscription.open(openInput());
    sub.overrideOccurrence(inWindow, { skipped: true, lines: [line("SKU-9", 5)], note: "congés" });
    const [override] = sub.toPersistence().overrides;
    expect(override).toEqual({
      occurrenceDate: new Date("2026-09-01T00:00:00.000Z"),
      skipped: true,
      lines: [],
      note: "congés",
    });
  });

  it("enregistre un remplacement de lignes", () => {
    const sub = Subscription.open(openInput());
    sub.overrideOccurrence(inWindow, { skipped: false, lines: [line("SKU-2", 4)], note: "" });
    expect(sub.toPersistence().overrides[0]?.lines).toEqual([{ sku: "SKU-2", quantity: 4 }]);
  });

  it("refuse un remplacement sans ligne", () => {
    const sub = Subscription.open(openInput());
    expect(() => sub.overrideOccurrence(inWindow, { skipped: false, lines: [], note: "" })).toThrow(
      EmptyOverrideError,
    );
  });

  it("refuse une échéance avant le début", () => {
    const sub = Subscription.open(openInput());
    expect(() =>
      sub.overrideOccurrence(IsoDate.fromString("2026-08-09"), {
        skipped: true,
        lines: [],
        note: "",
      }),
    ).toThrow(OccurrenceOutsideWindowError);
  });

  it("refuse une échéance après la fin", () => {
    const sub = Subscription.open(openInput());
    expect(() =>
      sub.overrideOccurrence(IsoDate.fromString("2026-12-11"), {
        skipped: true,
        lines: [],
        note: "",
      }),
    ).toThrow(OccurrenceOutsideWindowError);
  });

  it("accepte les bornes exactes (début et fin)", () => {
    const sub = Subscription.open(openInput());
    expect(() =>
      sub.overrideOccurrence(IsoDate.fromString("2026-08-10"), {
        skipped: true,
        lines: [],
        note: "",
      }),
    ).not.toThrow();
    expect(() =>
      sub.overrideOccurrence(IsoDate.fromString("2026-12-10"), {
        skipped: true,
        lines: [],
        note: "",
      }),
    ).not.toThrow();
  });

  it("sans date de fin, une échéance lointaine reste dans la fenêtre", () => {
    const sub = Subscription.open(openInput({ endDate: null }));
    expect(() =>
      sub.overrideOccurrence(IsoDate.fromString("2030-01-01"), {
        skipped: true,
        lines: [],
        note: "",
      }),
    ).not.toThrow();
  });

  it("remplace la dérogation existante d'une même date (pas de doublon)", () => {
    const sub = Subscription.open(openInput());
    sub.overrideOccurrence(inWindow, { skipped: true, lines: [], note: "v1" });
    sub.overrideOccurrence(inWindow, { skipped: false, lines: [line("SKU-3", 1)], note: "v2" });
    const { overrides } = sub.toPersistence();
    expect(overrides).toHaveLength(1);
    expect(overrides[0]?.note).toBe("v2");
    expect(overrides[0]?.skipped).toBe(false);
  });
});
