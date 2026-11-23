import type { BillingAddressPayload } from "@lfd/contracts";

import {
  EmptyOverrideError,
  EmptySubscriptionError,
  InvalidDateRangeError,
  InvalidRoutingError,
  OccurrenceOutsideWindowError,
  SubscriptionAlreadyActiveError,
  SubscriptionAlreadyPausedError,
  SubscriptionCancelledError,
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
    companyId: null,
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
    sub.resume(IsoDate.fromString("2026-09-14"));
    expect(sub.toPersistence().status).toBe("active");
  });

  it("la reprise pose la borne basse du planificateur au jour de la reprise", () => {
    const sub = Subscription.open(openInput());
    sub.arm(IsoDate.fromString("2026-08-10"));
    sub.pause();
    sub.resume(IsoDate.fromString("2026-09-14"));
    expect(sub.armedSince?.toString()).toBe("2026-09-14");
    expect(sub.toPersistence().armedFrom?.toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });

  it("refuse de reprendre un panier déjà actif", () => {
    const sub = Subscription.open(openInput());
    expect(() => sub.resume(IsoDate.fromString("2026-09-14"))).toThrow(
      SubscriptionAlreadyActiveError,
    );
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

describe("Subscription — ce que le journal en relit", () => {
  const inWindow = IsoDate.fromString("2026-09-01");

  it("currentStatus suit les transitions", () => {
    const sub = Subscription.open(openInput());
    expect(sub.currentStatus).toBe("active");
    sub.pause();
    expect(sub.currentStatus).toBe("paused");
  });

  it("overrideOn rend la dérogation posée sur une date, null sinon", () => {
    const sub = Subscription.open(openInput());
    expect(sub.overrideOn(inWindow)).toBeNull();

    const posed = sub.overrideOccurrence(inWindow, { skipped: true, lines: [], note: "" });

    expect(sub.overrideOn(inWindow)).toBe(posed);
    expect(posed.skipped).toBe(true);
  });

  it("decision() dit ce que le panier décide, sans son adresse ni sa note", () => {
    const sub = Subscription.open(
      openInput({
        routing: { method: "delivery", deliveryAddress: ADDRESS, pickupAddressId: null },
        note: "Code portail 1234",
      }),
    );

    const decision = sub.decision();

    expect(decision).toEqual({
      recurrence: "weekly",
      status: "active",
      startDate: "2026-08-10",
      endDate: "2026-12-10",
      fulfillmentMethod: "delivery",
      pickupAddressId: null,
      lines: [{ sku: "SKU-1", quantity: 2 }],
    });
    expect(JSON.stringify(decision)).not.toContain(ADDRESS.ligne1);
    expect(JSON.stringify(decision)).not.toContain("1234");
  });
});

describe("Subscription — la société de l'abonnement (N4e)", () => {
  it("open la porte telle quelle, perso compris", () => {
    expect(Subscription.open(openInput({ companyId: "chalet" })).toPersistence().companyId).toBe(
      "chalet",
    );
    expect(Subscription.open(openInput()).companyId).toBeNull();
  });
});

describe("Subscription.cancel — l'arrêt garde le panier en base", () => {
  it("arrête un panier actif, et l'état persisté le dit", () => {
    const sub = Subscription.open(openInput());
    sub.cancel();
    expect(sub.isCancelled).toBe(true);
    expect(sub.toPersistence().status).toBe("cancelled");
  });

  it("arrête un panier en pause", () => {
    const sub = Subscription.open(openInput());
    sub.pause();
    sub.cancel();
    expect(sub.toPersistence().status).toBe("cancelled");
  });

  it("garde lignes et dérogations : rien n'est effacé", () => {
    const sub = Subscription.open(openInput());
    sub.overrideOccurrence(IsoDate.fromString("2026-09-01"), {
      skipped: true,
      lines: [],
      note: "",
    });
    const before = sub.toPersistence();
    sub.cancel();
    const after = sub.toPersistence();
    expect(after.lines).toEqual(before.lines);
    expect(after.overrides).toEqual(before.overrides);
  });

  it.each([
    ["un second arrêt", (sub: Subscription) => sub.cancel()],
    ["la pause", (sub: Subscription) => sub.pause()],
    ["la reprise", (sub: Subscription) => sub.resume(IsoDate.fromString("2026-09-14"))],
    ["l'armement", (sub: Subscription) => sub.arm(IsoDate.fromString("2026-09-14"))],
    [
      "une dérogation",
      (sub: Subscription) =>
        sub.overrideOccurrence(IsoDate.fromString("2026-09-01"), {
          skipped: true,
          lines: [],
          note: "",
        }),
    ],
    ["la lecture de son état public", (sub: Subscription) => sub.currentStatus],
    ["la lecture de sa décision", (sub: Subscription) => sub.decision()],
  ])("un panier arrêté refuse %s", (_label, act) => {
    const sub = Subscription.open(openInput());
    sub.cancel();
    expect(() => act(sub)).toThrow(SubscriptionCancelledError);
    expect(sub.toPersistence().status).toBe("cancelled");
  });
});

describe("Subscription.arm — la borne basse du planificateur", () => {
  it("un panier neuf n'est pas armé", () => {
    const sub = Subscription.open(openInput());
    expect(sub.armedSince).toBeNull();
    expect(sub.toPersistence().armedFrom).toBeNull();
  });

  it("le premier armement pose la borne, le suivant ne la déplace pas", () => {
    const sub = Subscription.open(openInput());
    sub.arm(IsoDate.fromString("2026-11-23"));
    sub.arm(IsoDate.fromString("2026-12-01"));
    expect(sub.armedSince?.toString()).toBe("2026-11-23");
  });
});
