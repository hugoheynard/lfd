import type { BillingAddressPayload } from "@lfd/contracts";

import { Subscription, type OpenSubscriptionInput } from "../../entities/subscription.js";
import { IsoDate } from "../../value-objects/iso-date.js";
import { SubscriptionLine } from "../../value-objects/subscription-line.js";
import { servableOccurrence } from "../servable-occurrence.js";

const d = (raw: string): IsoDate => IsoDate.fromString(raw);
const WINDOW = { start: "07:00", end: "08:00" };
const MONDAY = d("2026-11-30");

function input(overrides: Partial<OpenSubscriptionInput> = {}): OpenSubscriptionInput {
  return {
    placedByUserId: "user_1",
    companyId: "co_1",
    fromOrderId: null,
    recurrence: "weekly",
    startDate: d("2026-11-23"),
    endDate: null,
    routing: { method: "pickup", deliveryAddress: null, pickupAddressId: "site_1", window: WINDOW },
    note: "Le lundi",
    lines: [SubscriptionLine.create("PAN-001", 4), SubscriptionLine.create("VIE-001", 2)],
    ...overrides,
  };
}

function armed(overrides: Partial<OpenSubscriptionInput> = {}): Subscription {
  const subscription = Subscription.open(input(overrides));
  subscription.arm(d("2026-11-23"));
  return subscription;
}

/** Un panier relu de la base, sans créneau : ouvert avant qu'on le demande. */
function withoutWindow(): Subscription {
  const address: BillingAddressPayload | null = null;
  return Subscription.reconstitute({
    ...input(),
    id: "sub_1",
    status: "active",
    overrides: [],
    armedFrom: d("2026-11-23"),
    routing: { method: "pickup", deliveryAddress: address, pickupAddressId: null, window: null },
  });
}

describe("servableOccurrence — l'échéance d'un jour, telle que le planificateur la sert", () => {
  it("sert le gabarit, au créneau du panier, pour l'acheteur qui l'a ouvert", () => {
    const served = servableOccurrence(armed(), "sub_1", MONDAY);
    expect(served).toMatchObject({
      kind: "servable",
      buyerUserId: "user_1",
      companyId: "co_1",
      note: "Le lundi",
      deltas: { added: [], removed: [] },
    });
    expect(served.kind === "servable" && served.routing.window).toEqual(WINDOW);
  });

  it("une dérogation sert ses lignes, sa note, et dit son écart au gabarit", () => {
    const subscription = armed();
    subscription.overrideOccurrence(MONDAY, {
      skipped: false,
      lines: [SubscriptionLine.create("PAN-001", 6), SubscriptionLine.create("SUR-001", 1)],
      note: "Sans viennoiserie",
    });
    expect(servableOccurrence(subscription, "sub_1", MONDAY)).toMatchObject({
      note: "Sans viennoiserie",
      deltas: {
        added: [
          { sku: "PAN-001", quantity: 2 },
          { sku: "SUR-001", quantity: 1 },
        ],
        removed: [{ sku: "VIE-001", quantity: 2 }],
      },
    });
  });

  it.each([
    ["hors du rythme", (s: Subscription) => s, d("2026-12-01")],
    ["avant la borne basse", (s: Subscription) => s, d("2026-11-16")],
    [
      "sautée",
      (s: Subscription) => {
        s.overrideOccurrence(MONDAY, { skipped: true, lines: [], note: "" });
        return s;
      },
      MONDAY,
    ],
    [
      "en pause",
      (s: Subscription) => {
        s.pause();
        return s;
      },
      MONDAY,
    ],
  ])("n'est pas due : %s", (_label, shape, date) => {
    expect(servableOccurrence(shape(armed()), "sub_1", date)).toEqual({ kind: "not_due" });
  });

  it("n'est pas due tant que le panier n'est pas armé", () => {
    expect(servableOccurrence(Subscription.open(input()), "sub_1", MONDAY)).toEqual({
      kind: "not_due",
    });
  });

  it("un panier sans créneau est un refus, pas une absence", () => {
    expect(servableOccurrence(withoutWindow(), "sub_1", MONDAY)).toEqual({
      kind: "no_window",
      buyerUserId: "user_1",
    });
  });
});
