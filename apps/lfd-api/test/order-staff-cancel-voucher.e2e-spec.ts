/**
 * E2E de **la refusion du bon** à l'annulation staff (doc
 * `documentation/commandes/annulation/fusion-du-bon.md`, lot C3b, C3b.9) — le
 * bon rendu, le reliquat refondu, le bon échu, les refus, la chaîne, et
 * l'index partiel. Les courses sont dans `order-staff-cancel-voucher-races`.
 */
import { LoyaltyVoucherRepository } from "../src/b2b/loyalty/domain/ports/loyalty-voucher.repository.js";
import { LoyaltyReason } from "../src/b2b/loyalty/domain/value-objects/loyalty-reason.js";
import { OrderStatus } from "../src/platform/database/client/client.js";
import { E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  cancelledMails,
  cancelRequest,
  deliver,
  orderState,
  resetScene,
  withdrawals,
} from "./order-staff-cancel-scene.js";
import {
  balanceOf,
  bootVoucherScene,
  cancellabilityOf,
  clock,
  convert,
  fidelity,
  liveRemainderOf,
  placed,
  remainderOf,
  voucherRow,
} from "./order-staff-cancel-voucher-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootVoucherScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
});

const YEAR_AND_A_DAY = 366 * 86_400_000;

describe("le total nul couvert par un bon s'annule (lot C3b)", () => {
  it("bon imputé en entier : rendu, marque effacée, courriel et journal le disent", async () => {
    const user = await fidelity();
    const parent = await convert(user);
    const order = await placed(parent, 2);
    expect(await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      totalCents: 0,
      voucherDiscountCents: 500,
    });
    expect(await liveRemainderOf(parent)).toBeNull();

    expect(await cancellabilityOf(order.id)).toMatchObject({
      cancellable: true,
      voucher: { outcome: "returned", voucherValueCents: 500 },
    });
    await cancelRequest(order.id).expect(204);
    await deliver();

    expect(await voucherRow(parent)).toMatchObject({
      status: "available",
      remainderSettledAt: null,
    });
    expect(cancelledMails()[0]?.data).toMatchObject({
      regime: "free",
      voucher: { outcome: "returned", voucherValueCents: 500, remainderValueCents: null },
    });
    const journal = await ctx.prisma.activityEvent.findMany({ where: { type: "order.cancelled" } });
    expect(journal[0]?.payload).toMatchObject({ voucher: { outcome: "returned" } });
    expect(journal[0]?.payload).not.toHaveProperty("voucherReturned");
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "loyalty.voucher_reinstated" } }),
    ).toBe(1);
  });

  it("reliquat disponible : refondu, le parent retrouve valeur et date, aucun point", async () => {
    const user = await fidelity();
    const parent = await convert(user);
    const before = await voucherRow(parent);
    const order = await placed(parent, 1);
    const child = await remainderOf(parent);
    const points = await balanceOf(user);

    const preview = await cancellabilityOf(order.id);
    await cancelRequest(order.id).expect(204);

    expect(preview).toMatchObject({
      cancellable: true,
      voucher: { outcome: "merged", voucherValueCents: 500, remainderValueCents: 250 },
    });
    expect(await voucherRow(child)).toMatchObject({
      status: "merged_back",
      mergedBackOrderId: order.id,
    });
    expect(await voucherRow(parent)).toMatchObject({
      status: "available",
      remainderSettledAt: null,
      valueCents: 500,
      expiresAt: before.expiresAt,
    });
    expect(await balanceOf(user)).toBe(points);
  });

  it("après refusion, le parent resservi laisse un second reliquat (index partiel)", async () => {
    const user = await fidelity();
    const parent = await convert(user);
    const first = await placed(parent, 1);
    await cancelRequest(first.id).expect(204);

    await placed(parent, 1);

    const rows = await ctx.prisma.loyaltyVoucher.findMany({ where: { parentVoucherId: parent } });
    expect(rows.map((row) => row.status).sort()).toEqual(["available", "merged_back"]);
  });

  it("refuse deux reliquats non refondus pour le même bon", async () => {
    const user = await fidelity();
    const parent = await convert(user);
    await placed(parent, 1);
    const child = await voucherRow(await remainderOf(parent));

    // SQL brut : seule défense contre une migration générée qui supprimerait
    // l'index partiel écrit à la main (C3b.2).
    const second = ctx.prisma.$executeRawUnsafe(
      `INSERT INTO "public"."loyalty_vouchers"
         ("id", "user_id", "value_cents", "points_cost", "ratio_points_per_step",
          "ratio_step_value_cents", "issued_at", "expires_at", "status", "parent_voucher_id")
       VALUES ('lv_second', $1, 100, 0, 1000, 500, $2, $3, 'available', $4)`,
      user,
      child.issuedAt,
      child.expiresAt,
      parent,
    );

    await expect(second).rejects.toThrow(/loyalty_vouchers_live_remainder_key|unique/iu);
  });
});

describe("les refus du bon (cas 5 et 6)", () => {
  it("reliquat engagé sur une autre commande : 409 qui la nomme, rien n'est écrit", async () => {
    const user = await fidelity();
    const parent = await convert(user);
    const first = await placed(parent, 1);
    const second = await placed(await remainderOf(parent), 1);

    const response = await cancelRequest(first.id);

    expect(response.status).toBe(409);
    const body = jsonBody<{ readonly code: string; readonly message: string }>(response);
    expect(body.code).toBe("orders.cancel.voucher_remainder_engaged");
    expect(body.message).toContain(`${second.number} : annulez-la d'abord`);
    expect((await orderState(first.id)).status).toBe(OrderStatus.placed);
    expect(await withdrawals()).toEqual([]);
    expect(await cancellabilityOf(first.id)).toEqual({ cancellable: false, reason: body.message });
  });

  it("reliquat annulé par l'équipe : 409, rien n'est écrit", async () => {
    const user = await fidelity();
    const parent = await convert(user);
    const order = await placed(parent, 1);
    // Par l'agrégat et son dépôt : le geste HTTP d'annulation d'un reliquat
    // tombe en 500 (recrédit de 0 point refusé par le livre, hors de ce lot).
    const vouchers = ctx.app.get(LoyaltyVoucherRepository);
    const child = await vouchers.load(await remainderOf(parent));
    child?.cancel(clock.now(), E2E_STAFF_ID, LoyaltyReason.of("geste commercial repris"));
    if (child !== null) {
      await vouchers.save(child);
    }

    const response = await cancelRequest(order.id);

    expect(response.status).toBe(409);
    expect(jsonBody<{ readonly code: string }>(response).code).toBe(
      "orders.cancel.voucher_remainder_cancelled",
    );
    expect((await orderState(order.id)).status).toBe(OrderStatus.placed);
  });
});

describe("la chaîne P → R1 → R2", () => {
  it("annuler la dernière, puis la première : chaque reliquat se refond dans son parent", async () => {
    const user = await fidelity();
    const parent = await convert(user, 2);
    const first = await placed(parent, 1);
    const r1 = await remainderOf(parent);
    const second = await placed(r1, 1);
    const r2 = await remainderOf(r1);

    await cancelRequest(second.id).expect(204);
    expect(await voucherRow(r2)).toMatchObject({ status: "merged_back" });
    expect(await voucherRow(r1)).toMatchObject({ status: "available", valueCents: 750 });

    await cancelRequest(first.id).expect(204);
    expect(await voucherRow(r1)).toMatchObject({ status: "merged_back" });
    expect(await voucherRow(parent)).toMatchObject({ status: "available", valueCents: 1_000 });
  });

  it("annuler la première d'abord est refusé, puis possible une fois la seconde annulée", async () => {
    const user = await fidelity();
    const parent = await convert(user, 2);
    const first = await placed(parent, 1);
    const second = await placed(await remainderOf(parent), 1);

    await cancelRequest(first.id).expect(409);
    await cancelRequest(second.id).expect(204);
    await cancelRequest(first.id).expect(204);

    expect(await voucherRow(parent)).toMatchObject({ status: "available" });
  });
});

describe("le bon échu à l'annulation (cas 4)", () => {
  afterEach(() => {
    clock.set(new Date());
  });

  it("annulée, bon et reliquat expirés, rien rendu, et le courriel se tait sur le bon", async () => {
    const user = await fidelity();
    const parent = await convert(user);
    const order = await placed(parent, 1);
    const child = await remainderOf(parent);
    clock.advanceMs(YEAR_AND_A_DAY);

    expect(await cancellabilityOf(order.id)).toMatchObject({ voucher: { outcome: "lapsed" } });
    await cancelRequest(order.id).expect(204);
    await deliver();

    expect((await orderState(order.id)).status).toBe(OrderStatus.cancelled);
    expect(await voucherRow(parent)).toMatchObject({ status: "expired" });
    expect(await voucherRow(child)).toMatchObject({ status: "expired" });
    expect(cancelledMails()[0]?.data).toMatchObject({ voucher: { outcome: "lapsed" } });
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "loyalty.voucher_reinstated" } }),
    ).toBe(0);
  });

  /**
   * Régression (C3b.1, 5) : une carte non payée dont le bon était échu
   * annonçait au client « votre bon vous est rendu » pour un bon mort.
   */
  it("carte non payée, bon échu : le courriel ne dit pas « rendu »", async () => {
    const user = await fidelity();
    const parent = await convert(user, 1);
    const order = await placed(parent, 10);
    clock.advanceMs(YEAR_AND_A_DAY);

    await cancelRequest(order.id).expect(204);
    await deliver();

    expect(await voucherRow(parent)).toMatchObject({ status: "expired" });
    expect(cancelledMails()[0]?.data).toMatchObject({
      regime: "due",
      voucher: { outcome: "lapsed" },
    });
  });
});
