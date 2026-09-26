/**
 * E2E de la **fidélité** (plan `documentation/comptabilite/plan-points-de-fidelite.md`,
 * lots A et B) — `/admin/accounting/loyalty`, et la conversion par le bus.
 *
 * Ce que seul le vrai SQL prouve :
 * - le verrou consultatif : deux conversions concurrentes ne font jamais
 *   passer le solde sous zéro ;
 * - les `CHECK` : un seul titulaire par ligne, des paliers entiers au ratio figé ;
 * - l'index partiel : une annulation ne recrédite qu'une fois ;
 * - le programme fermé tant qu'aucun réglage n'est écrit.
 *
 * La conversion n'a pas encore de route (lot E1) : elle passe par le vrai bus,
 * contre la vraie base. Frontière doublée : la signature du jeton staff.
 */
import type {
  LoyaltyBalanceView,
  LoyaltySettingsView,
  LoyaltyVoucherView,
  SetLoyaltySettingsPayload,
} from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { ConvertLoyaltyPointsCommand } from "../src/b2b/loyalty/application/commands/convert-loyalty-points.command.js";
import {
  InsufficientLoyaltyPointsError,
  LoyaltyProgramClosedError,
} from "../src/b2b/loyalty/domain/errors/loyalty-errors.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

const BASE = "/admin/accounting/loyalty";
const SETTINGS: SetLoyaltySettingsPayload = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function person(): Promise<string> {
  const user = await createUser(ctx.prisma, {
    auth0Sub: "auth0|fidele",
    firstName: "Léa",
    lastName: "Martin",
  });
  return user.id;
}

async function credit(userId: string, points: number): Promise<void> {
  await staff()
    .post(`${BASE}/adjustments`)
    .send({ holderKind: "user", holderId: userId, points, reason: "reprise de l'ancienne carte" })
    .expect(204);
}

function convert(userId: string, steps: number): Promise<string> {
  return ctx.app
    .get(CommandBus)
    .execute<ConvertLoyaltyPointsCommand, string>(
      new ConvertLoyaltyPointsCommand("user", userId, userId, steps),
    );
}

async function balances(): Promise<LoyaltyBalanceView[]> {
  return jsonBody<LoyaltyBalanceView[]>(await staff().get(`${BASE}/balances`).expect(200));
}

describe("le réglage — Comptabilité › Fidélité", () => {
  it("vaut « fermé » tant que rien n'est écrit, puis se pose en entier", async () => {
    expect(
      jsonBody<LoyaltySettingsView>(await staff().get(`${BASE}/settings`).expect(200)),
    ).toEqual({
      settings: null,
    });
    await staff().put(`${BASE}/settings`).send(SETTINGS).expect(204);
    expect(
      jsonBody<LoyaltySettingsView>(await staff().get(`${BASE}/settings`).expect(200)),
    ).toEqual({
      settings: SETTINGS,
    });
    expect(await ctx.prisma.loyaltySettings.count()).toBe(1);
  });

  it("refuse un palier à zéro, ou un réglage incomplet, à la forme", async () => {
    await staff()
      .put(`${BASE}/settings`)
      .send({ ...SETTINGS, stepValueCents: 0 })
      .expect(400);
    await staff().put(`${BASE}/settings`).send({ pointsPerStep: 1_000 }).expect(400);
  });
});

describe("la conversion en bon", () => {
  it("🔴 est refusée tant que le programme est fermé, et n'écrit rien", async () => {
    const userId = await person();
    await credit(userId, 5_000);

    await expect(convert(userId, 1)).rejects.toThrow(LoyaltyProgramClosedError);
    expect(await ctx.prisma.loyaltyVoucher.count()).toBe(0);
  });

  it("émet un bon de paliers entiers, figé au ratio du moment", async () => {
    const userId = await person();
    await staff().put(`${BASE}/settings`).send(SETTINGS).expect(204);
    await credit(userId, 2_340);

    const voucherId = await convert(userId, 2);
    await staff()
      .put(`${BASE}/settings`)
      .send({ ...SETTINGS, stepValueCents: 700 })
      .expect(204);

    const [voucher] = jsonBody<LoyaltyVoucherView[]>(
      await staff().get(`${BASE}/vouchers`).expect(200),
    );
    expect(voucher).toMatchObject({
      id: voucherId,
      valueCents: 1_000,
      pointsCost: 2_000,
      ratio: { pointsPerStep: 1_000, stepValueCents: 500 },
      status: "available",
      holder: { kind: "user", id: userId, label: "Léa Martin" },
    });
    expect(await balances()).toEqual([
      { holder: { kind: "user", id: userId, label: "Léa Martin" }, points: 340 },
    ]);
  });

  it("🔴 deux conversions concurrentes ne font jamais passer le solde sous zéro", async () => {
    const userId = await person();
    await staff().put(`${BASE}/settings`).send(SETTINGS).expect(204);
    await credit(userId, 1_500);

    const results = await Promise.allSettled([convert(userId, 1), convert(userId, 1)]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((result) => result.status === "rejected");
    expect(refused?.status === "rejected" ? refused.reason : null).toBeInstanceOf(
      InsufficientLoyaltyPointsError,
    );
    const sum = await ctx.prisma.loyaltyLedgerEntry.aggregate({
      where: { userId },
      _sum: { points: true },
    });
    expect(sum._sum.points).toBe(500);
    expect(await ctx.prisma.loyaltyVoucher.count()).toBe(1);
  });
});

describe("l'annulation d'un bon", () => {
  it("🔴 recrédite ses points une fois, et une seule", async () => {
    const userId = await person();
    await staff().put(`${BASE}/settings`).send(SETTINGS).expect(204);
    await credit(userId, 1_000);
    const voucherId = await convert(userId, 1);

    await staff()
      .post(`${BASE}/vouchers/${voucherId}/cancel`)
      .send({ reason: "erreur" })
      .expect(204);
    await staff()
      .post(`${BASE}/vouchers/${voucherId}/cancel`)
      .send({ reason: "erreur" })
      .expect(409);

    expect((await balances())[0]?.points).toBe(1_000);
    const [voucher] = jsonBody<LoyaltyVoucherView[]>(
      await staff().get(`${BASE}/vouchers`).expect(200),
    );
    expect(voucher).toMatchObject({ status: "cancelled", cancellationReason: "erreur" });
    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "loyalty." } },
      select: { type: true },
    });
    expect(facts.map((fact) => fact.type).sort()).toEqual([
      "loyalty.points_adjusted",
      "loyalty.points_adjusted",
      "loyalty.voucher_cancelled",
      "loyalty.voucher_issued",
    ]);
  });

  it("refuse un motif vide à la forme", async () => {
    await staff().post(`${BASE}/vouchers/absent/cancel`).send({ reason: " " }).expect(400);
  });

  it("rend un 404 pour un bon inconnu", async () => {
    await staff().post(`${BASE}/vouchers/absent/cancel`).send({ reason: "erreur" }).expect(404);
  });
});

describe("l'ajustement motivé", () => {
  it("refuse un retrait au-delà du solde : le solde ne descend jamais sous zéro", async () => {
    const userId = await person();
    await credit(userId, 100);
    await staff()
      .post(`${BASE}/adjustments`)
      .send({ holderKind: "user", holderId: userId, points: -101, reason: "erreur" })
      .expect(409);
    expect((await balances())[0]?.points).toBe(100);
  });

  it("rend un 404 pour un titulaire inconnu", async () => {
    await staff()
      .post(`${BASE}/adjustments`)
      .send({ holderKind: "company", holderId: "absente", points: 10, reason: "geste" })
      .expect(404);
  });
});

describe("les contraintes de la base", () => {
  async function insertEntry(companyId: string | null, userId: string | null): Promise<unknown> {
    return ctx.prisma.$executeRaw`
      INSERT INTO "public"."loyalty_ledger_entries"
        ("id", "company_id", "user_id", "kind", "points", "occurred_at", "staff_user_id", "reason")
      VALUES ('brut', ${companyId}, ${userId}, 'adjusted', 10, now(), 'staff', 'test')`;
  }

  it("🔴 refuse une ligne sans titulaire, ou à deux titulaires", async () => {
    const userId = await person();
    const company = await ctx.prisma.company.findFirst();
    expect(company).toBeNull();
    await expect(insertEntry(null, null)).rejects.toThrow(/loyalty_ledger_entries_one_holder/u);
    await expect(insertEntry("une-societe", userId)).rejects.toThrow(/one_holder|foreign key/u);
  });

  it("🔴 refuse un bon qui ne vaut pas ses paliers entiers au ratio figé", async () => {
    const userId = await person();
    await expect(
      ctx.prisma.$executeRaw`
        INSERT INTO "public"."loyalty_vouchers"
          ("id", "user_id", "value_cents", "points_cost", "ratio_points_per_step",
           "ratio_step_value_cents", "issued_at", "expires_at", "status")
        VALUES ('brut', ${userId}, 501, 1000, 1000, 500, now(), now() + interval '1 day', 'available')`,
    ).rejects.toThrow(/loyalty_vouchers_whole_steps/u);
  });

  it("🔴 refuse une seconde ligne de recrédit pour le même bon", async () => {
    const userId = await person();
    await staff().put(`${BASE}/settings`).send(SETTINGS).expect(204);
    await credit(userId, 1_000);
    const voucherId = await convert(userId, 1);
    await staff()
      .post(`${BASE}/vouchers/${voucherId}/cancel`)
      .send({ reason: "erreur" })
      .expect(204);

    await expect(
      ctx.prisma.$executeRaw`
        INSERT INTO "public"."loyalty_ledger_entries"
          ("id", "user_id", "kind", "points", "voucher_id", "occurred_at", "staff_user_id", "reason")
        VALUES ('doublon', ${userId}, 'adjusted', 1000, ${voucherId}, now(), 'staff', 'rejeu')`,
    ).rejects.toThrow(/loyalty_ledger_entries_adjusted_voucher_key/u);
  });
});
