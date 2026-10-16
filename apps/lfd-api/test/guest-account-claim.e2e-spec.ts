/**
 * E2E de **l'invité qui devient le compte** (R1 du plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`,
 * lot A) : la première entrée d'un `sub` inconnu, par une connexion qui prouve
 * l'adresse, prend possession de l'unique fiche invité de cette adresse — et
 * ses commandes définitives rapportent aussitôt leurs points.
 *
 * Ce que seul le vrai SQL prouve : l'écriture conditionnelle sous deux entrées
 * simultanées, l'index unique du gain sous l'abonné puis le rattrapage, et
 * `became_account_at` posé par les trois chemins sans jamais être réécrit.
 *
 * Par le vrai resolver et non par HTTP : le verifier doublé du harnais ne
 * porte ni l'adresse ni sa preuve (même choix que `me.e2e-spec.ts`).
 * Frontières doublées : la signature du jeton staff, le fournisseur
 * d'identité (Auth0, tenant distant).
 */
import type { SetLoyaltySettingsPayload } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { NO_LOGIN_METHODS } from "../src/b2b/account/domain/ports/__tests__/login-method-doubles.js";
import { CustomerIdentityPort } from "../src/b2b/account/domain/ports/customer-identity.port.js";
import { AccountAccessGranter } from "../src/b2b/account/application/services/grant-account-access.service.js";
import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { MarkOrderFulfilledCommand } from "../src/b2b/orders/application/commands/mark-order-fulfilled.command.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PrincipalResolver } from "../src/platform/auth/principal.resolver.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import type { ProvisionedIdentity } from "../src/platform/shared/identity/provisioned-identity.js";
import { bootstrapE2e, E2E_STAFF_ID, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { createCompany, createGuest } from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const SETTINGS: SetLoyaltySettingsPayload = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
  welcomeBonusPoints: null,
};

const ADDRESS = "lea@invitee-e2e.fr";
const BY_CODE = "email|e2e-lea";
const BY_GOOGLE = "google-oauth2|e2e-lea";
const BY_PASSWORD = "auth0|e2e-lea";
/** Le `sub` que le fournisseur doublé rend à une ouverture d'accès staff. */
const STAFF_PROVISIONED = "auth0|e2e-staff-ouvre";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const identityDouble: CustomerIdentityPort = {
  ...NO_LOGIN_METHODS,
  changeEmail: (): Promise<void> => Promise.resolve(),
  provision: (): Promise<ProvisionedIdentity> =>
    Promise.resolve({ subject: STAFF_PROVISIONED, passwordSetupUrl: "https://exemple.test/mdp" }),
  issuePasswordLink: (): Promise<string> => Promise.resolve("https://exemple.test/mot-de-passe"),
};

let ctx: E2eContext;
let sequence = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CustomerIdentityPort, value: identityDouble },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Une première entrée, adresse prouvée par défaut. */
function enter(subject: string, emailVerified = true, email = ADDRESS) {
  return ctx.app.get(PrincipalResolver).resolve({ subject, scopes: [], email, emailVerified });
}

async function openProgram(): Promise<void> {
  await ctx.asSub(E2E_STAFF_SUB).put("/admin/loyalty/settings").send(SETTINGS).expect(204);
}

/** Une commande publique de l'invité, rendue définitive (réglée puis remise). */
async function completedOrderOf(userId: string): Promise<string> {
  sequence += 1;
  const number = `CMD-RAT-${String(sequence)}`;
  const intent = `pi_rattache_${String(sequence)}`;
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: number,
      placedByUserId: userId,
      companyId: null,
      clientele: OrderClientele.public,
      status: OrderStatus.ready,
      subtotalCents: 2_340,
      discountCents: 0,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      vatCents: 0,
      totalCents: 2_340,
      paymentStatus: PaymentStatus.pending,
      stripePaymentIntentId: intent,
    },
    select: { id: true },
  });
  const bus = ctx.app.get(CommandBus);
  await bus.execute(new ConfirmOrderPaymentCommand(intent, "succeeded"));
  await bus.execute(new MarkOrderFulfilledCommand(number, E2E_STAFF_ID, new Date(), "scan"));
  await ctx.drain();
  return order.id;
}

function earned() {
  return ctx.prisma.loyaltyLedgerEntry.findMany({
    where: { kind: "earned" },
    select: { orderId: true, points: true, userId: true },
  });
}

function stored(id: string) {
  return ctx.prisma.user.findUniqueOrThrow({ where: { id } });
}

describe("R1 — la fiche invité devient le compte", () => {
  it("rattache par code e-mail, et crédite la commande définitive une seule fois", async () => {
    await openProgram();
    const guest = await createGuest(ctx.prisma, { email: "Lea@Invitee-E2E.fr" });
    const orderId = await completedOrderOf(guest.id);
    // Invité au moment des deux faits : rien n'est dû.
    expect(await earned()).toEqual([]);

    const principal = await enter(BY_CODE);
    await ctx.drain();

    expect(principal.userId).toBe(guest.id);
    const claimed = await stored(guest.id);
    expect(claimed).toMatchObject({ auth0Sub: BY_CODE, emailVerified: true });
    expect(claimed.becameAccountAt).toBeInstanceOf(Date);
    expect(await ctx.prisma.user.count()).toBe(1);
    expect(await earned()).toEqual([{ orderId, points: 2_340, userId: guest.id }]);
    // Le rattrapage de nuit passe ensuite : rien de plus.
    await ctx
      .http()
      .post("/admin/loyalty/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    expect(await earned()).toHaveLength(1);
    // La croissance l'a compté comme une inscription.
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "user.registered", subjectId: guest.id },
      }),
    ).toBe(1);
  });

  it("rattache aussi par Google", async () => {
    const guest = await createGuest(ctx.prisma, { email: ADDRESS });

    expect((await enter(BY_GOOGLE)).userId).toBe(guest.id);
  });

  it("🔴 refuse par mot de passe : compte neuf, fiche invité intacte", async () => {
    const guest = await createGuest(ctx.prisma, { email: ADDRESS });

    const principal = await enter(BY_PASSWORD);

    expect(principal.userId).not.toBe(guest.id);
    expect(await stored(guest.id)).toMatchObject({
      auth0Sub: null,
      emailVerified: false,
      becameAccountAt: null,
    });
  });

  it("🔴 refuse une adresse que le jeton ne prouve pas : compte neuf, fiche intacte", async () => {
    const guest = await createGuest(ctx.prisma, { email: ADDRESS });

    const principal = await enter(BY_CODE, false);

    expect(principal.userId).not.toBe(guest.id);
    expect((await stored(guest.id)).auth0Sub).toBeNull();
  });

  it("deux fiches invité à la même adresse : compte neuf, aucune prise (R5)", async () => {
    const first = await createGuest(ctx.prisma, { email: ADDRESS });
    const second = await createGuest(ctx.prisma, { email: ADDRESS.toUpperCase() });

    const principal = await enter(BY_CODE);

    expect([first.id, second.id]).not.toContain(principal.userId);
    expect((await stored(first.id)).auth0Sub).toBeNull();
    expect((await stored(second.id)).auth0Sub).toBeNull();
  });

  /**
   * Deux premières entrées simultanées sous deux moyens : l'écriture
   * conditionnelle n'en laisse passer qu'une, la perdante relit et trouve un
   * compte — donc le refus, et aucun second compte.
   */
  it("une course entre deux premières entrées : une seule gagne", async () => {
    const guest = await createGuest(ctx.prisma, { email: ADDRESS });

    const outcomes = await Promise.allSettled([enter(BY_CODE), enter(BY_GOOGLE)]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(await ctx.prisma.user.count()).toBe(1);
    expect([BY_CODE, BY_GOOGLE]).toContain((await stored(guest.id)).auth0Sub);
  });

  it("deux premières entrées du MÊME `sub` : les deux entrent, sur la fiche", async () => {
    const guest = await createGuest(ctx.prisma, { email: ADDRESS });

    const [one, two] = await Promise.all([enter(BY_CODE), enter(BY_CODE)]);

    expect([one.userId, two.userId]).toEqual([guest.id, guest.id]);
    expect(await ctx.prisma.user.count()).toBe(1);
  });
});

describe("`became_account_at` — posé par les trois chemins, jamais réécrit", () => {
  it("à la création au provisionnement, puis jamais réécrit", async () => {
    const principal = await enter(BY_PASSWORD);
    const first = (await stored(principal.userId)).becameAccountAt;
    expect(first).toBeInstanceOf(Date);

    await enter(BY_PASSWORD);

    expect((await stored(principal.userId)).becameAccountAt).toEqual(first);
  });

  it("au rattachement d'une fiche invité, puis jamais réécrit", async () => {
    const guest = await createGuest(ctx.prisma, { email: ADDRESS });
    await enter(BY_CODE);
    const first = (await stored(guest.id)).becameAccountAt;
    expect(first).toBeInstanceOf(Date);

    await enter(BY_CODE);

    expect((await stored(guest.id)).becameAccountAt).toEqual(first);
  });

  it("à l'ouverture d'accès staff sur une fiche invité, puis jamais réécrit", async () => {
    const guest = await createGuest(ctx.prisma, { email: ADDRESS });
    const company = await createCompany(ctx.prisma);
    const granter = ctx.app.get(AccountAccessGranter);
    const access = {
      companyId: company.id,
      companyName: "Le Comptoir",
      email: ADDRESS,
      firstName: "Léa",
      lastName: "",
      phone: "",
      role: "orders",
      invitedBy: E2E_STAFF_ID,
    } as const;

    await granter.grant(access);
    const first = await stored(guest.id);
    expect(first.auth0Sub).toBe(STAFF_PROVISIONED);
    expect(first.becameAccountAt).toBeInstanceOf(Date);

    // Sa première entrée par le lien : le compte existe, rien ne bouge.
    await enter(STAFF_PROVISIONED);

    expect((await stored(guest.id)).becameAccountAt).toEqual(first.becameAccountAt);
  });
});
