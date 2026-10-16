/**
 * E2E du **bonus de bienvenue** (lot C du plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`) :
 * une personne qui devient un compte, adresse prouvée, reçoit les points du
 * réglage — une fois, quel que soit le nombre de passages.
 *
 * Ce que seul le vrai SQL prouve : l'index unique `(user_id) WHERE kind =
 * 'welcome'` sous deux passages simultanés, la borne `welcome_bonus_since`
 * lue par la passe de nuit, et la preuve d'adresse recopiée à l'entrée.
 *
 * Par le vrai resolver et non par HTTP pour l'entrée : le verifier doublé du
 * harnais ne porte ni l'adresse ni sa preuve (même choix que
 * `guest-account-claim.e2e-spec.ts`). Frontière doublée : la signature du
 * jeton staff.
 */
import type { MyLoyaltyView, SetLoyaltySettingsPayload } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { CreditWelcomeBonusCommand } from "../src/b2b/loyalty/application/commands/credit-welcome-bonus.command.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PrincipalResolver } from "../src/platform/auth/principal.resolver.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createGuest } from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const BONUS = 500;
const SETTINGS: SetLoyaltySettingsPayload = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
  welcomeBonusPoints: BONUS,
};

const ADDRESS = "lea@bienvenue-e2e.fr";
const BY_CODE = "email|e2e-bienvenue";
const BY_PASSWORD = "auth0|e2e-bienvenue";

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

/** Une entrée par le resolver, adresse prouvée par défaut ; les abonnés ont fini au retour. */
async function enter(subject: string, emailVerified = true): Promise<string> {
  const principal = await ctx.app
    .get(PrincipalResolver)
    .resolve({ subject, scopes: [], email: ADDRESS, emailVerified });
  await ctx.drain();
  return principal.userId;
}

async function setSettings(welcomeBonusPoints: number | null): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put("/admin/loyalty/settings")
    .send({ ...SETTINGS, welcomeBonusPoints })
    .expect(204);
}

async function nightly(): Promise<{ welcome: { scanned: number; credited: number } }> {
  const response = await ctx
    .http()
    .post("/admin/loyalty/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  return jsonBody<{ welcome: { scanned: number; credited: number } }>(response);
}

function welcomes() {
  return ctx.prisma.loyaltyLedgerEntry.findMany({
    where: { kind: "welcome" },
    select: { userId: true, points: true, companyId: true, orderId: true },
  });
}

describe("le bonus de bienvenue, à l'entrée", () => {
  it("une inscription par code, bonus allumé : une ligne du montant du réglage, une seule", async () => {
    await setSettings(BONUS);

    const userId = await enter(BY_CODE);
    await enter(BY_CODE);
    await nightly();

    expect(await welcomes()).toEqual([{ userId, points: BONUS, companyId: null, orderId: null }]);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "loyalty.welcome_bonus_credited", subjectId: userId },
      }),
    ).toBe(1);
  });

  it("le relevé du client compte le bonus dans son solde", async () => {
    await setSettings(BONUS);
    await enter(BY_CODE);

    const view = jsonBody<MyLoyaltyView>(await ctx.asSub(BY_CODE).get("/me/loyalty").expect(200));

    expect(view).toMatchObject({ open: true, balancePoints: BONUS });
    expect(view.open && view.entries.map((entry) => entry.kind)).toEqual(["welcome"]);
  });

  it("une fiche invité rattachée (R1) reçoit le bonus", async () => {
    await setSettings(BONUS);
    const guest = await createGuest(ctx.prisma, { email: ADDRESS });

    expect(await enter(BY_CODE)).toBe(guest.id);

    expect(await welcomes()).toEqual([
      { userId: guest.id, points: BONUS, companyId: null, orderId: null },
    ]);
  });

  it("inscrit bonus éteint, puis bonus allumé : rien, même à la nuit", async () => {
    await setSettings(null);
    await enter(BY_CODE);
    await setSettings(BONUS);

    expect((await nightly()).welcome).toEqual({ scanned: 0, credited: 0 });
    expect(await welcomes()).toEqual([]);
  });
});

describe("le bonus de bienvenue, à la nuit", () => {
  it("adresse non prouvée : rien ; prouvée à une entrée suivante : la nuit crédite", async () => {
    await setSettings(BONUS);
    const userId = await enter(BY_PASSWORD, false);
    expect(await welcomes()).toEqual([]);
    expect((await nightly()).welcome).toEqual({ scanned: 0, credited: 0 });

    // La connexion suivante prouve l'adresse : `record` la recopie en base.
    await enter(BY_PASSWORD, true);
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified).toBe(
      true,
    );

    expect((await nightly()).welcome).toEqual({ scanned: 1, credited: 1 });
    expect(await welcomes()).toEqual([{ userId, points: BONUS, companyId: null, orderId: null }]);
    expect((await nightly()).welcome).toEqual({ scanned: 0, credited: 0 });
  });

  /** Hugo, 2026-10-11 : un compte désactivé par le staff ne reçoit pas de bonus. */
  it("compte désactivé, adresse prouvée : rien, même à la nuit ; réactivé, la nuit crédite", async () => {
    await setSettings(BONUS);
    const userId = await enter(BY_PASSWORD, false);
    await ctx.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, status: "disabled" },
    });

    expect((await nightly()).welcome).toEqual({ scanned: 0, credited: 0 });
    expect(await welcomes()).toEqual([]);

    await ctx.prisma.user.update({ where: { id: userId }, data: { status: "active" } });
    expect((await nightly()).welcome).toEqual({ scanned: 1, credited: 1 });
  });

  it("deux passages simultanés n'écrivent qu'une ligne", async () => {
    await setSettings(BONUS);
    const userId = await enter(BY_PASSWORD, false);
    await enter(BY_PASSWORD, true);
    const bus = ctx.app.get(CommandBus);

    await Promise.all([
      bus.execute(new CreditWelcomeBonusCommand(userId)),
      bus.execute(new CreditWelcomeBonusCommand(userId)),
      nightly(),
    ]);

    expect(await welcomes()).toHaveLength(1);
  });
});
