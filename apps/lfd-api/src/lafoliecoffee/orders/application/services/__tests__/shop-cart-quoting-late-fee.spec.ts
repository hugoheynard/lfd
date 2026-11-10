import type { OrderCutoffView, ShopQuotePayload } from "@lfd/contracts";

import type { LateFeeSetting } from "../../../domain/ports/order-late-fee.reader.js";
import { lateFeeJudgementOf, RecordingWaivers } from "./late-fee-judgement.doubles.js";
import { catalogItem, PRICED_AT, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * **Le devis d'une société chiffre la surtaxe prévue** (É11, plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, T1) : le jugement
 * de la passation, la dérogation lue sans être consommée.
 *
 * Le mur du devis est `PRICED_AT` (une horloge figée, jamais le mur) : la
 * règle « la veille à 9 h 30, une heure de grâce » pour le 16 janvier place le
 * devis du 15 à 10 h 00 de Paris (`09:00Z`) DANS la grâce.
 */
const CATALOG = [catalogItem("PAI-001", "Pain", 500_000, 5.5)];
const DAY = "2026-01-16";
const RULE: OrderCutoffView = {
  id: "general",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: "09:30",
  graceMinutes: 60,
};
const FIVE_EUROS: LateFeeSetting = {
  adjustment: { mode: "amount", cents: 500 },
  vatRatePercent: 20,
};
const PAYLOAD: ShopQuotePayload = {
  lines: [{ sku: "PAI-001", quantity: 2 }],
  fulfillment: { method: "pickup", pickupAddressId: "pickup_1" },
  requestedDeliveryDate: DAY,
};

interface Scene {
  readonly waiver?: { readonly id: string } | null;
  readonly setting?: LateFeeSetting | null;
}

async function totalOf(
  scene: Scene,
  who: { readonly companyId: string | null; readonly buyerUserId: string | null },
  payload: ShopQuotePayload = PAYLOAD,
) {
  const waivers = new RecordingWaivers(scene.waiver ?? null);
  const quoting = quotingOf({
    catalog: CATALOG,
    companyStatus: "active",
    lateFee: lateFeeJudgementOf({
      now: PRICED_AT,
      catalog: CATALOG,
      rules: [RULE],
      waivers,
      setting: scene.setting ?? null,
    }),
  });
  const { view } = await quoting.quote({ payload, ...who });
  return { total: view.totalCents, lateFee: view.lateFeeCents, waivers };
}

const PRO = { companyId: "co_1", buyerUserId: "user_1" } as const;

describe("ShopCartQuoting — la surtaxe de retard prévue (T1)", () => {
  it("🔴 dérogation ouverte : la surtaxe est chiffrée (HT + sa TVA), la dérogation NON consommée", async () => {
    const without = await totalOf({ waiver: null, setting: FIVE_EUROS }, PRO);
    const withWaiver = await totalOf({ waiver: { id: "w_1" }, setting: FIVE_EUROS }, PRO);

    expect(withWaiver.lateFee).toBe(500);
    expect(withWaiver.total - without.total).toBe(600);
    expect(withWaiver.waivers.asked).toEqual([`co_1@${DAY}`]);
    expect(withWaiver.waivers.consumed).toEqual([]);
  });

  it("réglage à 0 € : rien ne change", async () => {
    const without = await totalOf({ waiver: null }, PRO);
    const zero = await totalOf(
      {
        waiver: { id: "w_1" },
        setting: { ...FIVE_EUROS, adjustment: { mode: "amount", cents: 0 } },
      },
      PRO,
    );
    expect(zero.total).toBe(without.total);
    expect(zero.lateFee).toBeUndefined();
  });

  it("réglage absent : rien ne change", async () => {
    const without = await totalOf({ waiver: null }, PRO);
    const absent = await totalOf({ waiver: { id: "w_1" }, setting: null }, PRO);
    expect(absent.total).toBe(without.total);
    expect(absent.lateFee).toBeUndefined();
  });

  it("dans la grâce sans dérogation : le devis ne refuse pas, il ne chiffre rien", async () => {
    const reference = await totalOf({ waiver: { id: "w_1" }, setting: null }, PRO);
    const none = await totalOf({ waiver: null, setting: FIVE_EUROS }, PRO);
    expect(none.total).toBe(reference.total);
    expect(none.lateFee).toBeUndefined();
  });

  it("sans jour : pas de jugement, aucune dérogation lue", async () => {
    const { requestedDeliveryDate: _day, ...partial } = PAYLOAD;
    const quoted = await totalOf({ waiver: { id: "w_1" }, setting: FIVE_EUROS }, PRO, partial);
    expect(quoted.waivers.asked).toEqual([]);
    expect(quoted.lateFee).toBeUndefined();
  });

  it.each([
    ["anonyme", { companyId: null, buyerUserId: null }],
    ["particulier connecté", { companyId: null, buyerUserId: "user_1" }],
  ] as const)("%s : aucune dérogation lue, aucune surtaxe", async (_name, who) => {
    const quoted = await totalOf({ waiver: { id: "w_1" }, setting: FIVE_EUROS }, who);
    const reference = await totalOf({ waiver: null, setting: null }, who);
    expect(quoted.waivers.asked).toEqual([]);
    expect(quoted.total).toBe(reference.total);
    expect(quoted.lateFee).toBeUndefined();
  });
});
