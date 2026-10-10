/**
 * E2E de **l'invitation expirée, lue à l'entrée** (2026-10-10,
 * `documentation/auth-inscription/architecture-compte-client-cycle-de-vie.md`
 * §8.1 bis).
 *
 * Régression : depuis la connexion par code e-mail (2026-10-09), une personne
 * invitée dont l'invitation avait passé ses 7 jours entrait encore — par code
 * ou Google (`sub` inconnu → `UnknownSubjectAdmission.claim`), ou par son
 * lien (`CustomerPrincipalResolver.record`) — et la société s'ouvrait des mois
 * après. Même trou côté staff, par « mot de passe oublié ».
 *
 * Sur la vraie base : c'est ici que se voit que la transaction défait la
 * réécriture du `sub`, que la condition d'échéance est bien dans l'`UPDATE`,
 * et que le fait et la cloche atterrissent.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PrincipalResolver } from "../src/platform/auth/principal.resolver.js";
import type { VerifiedToken } from "../src/platform/auth/principal.js";
import { CustomerIdentityPort } from "../src/b2b/account/domain/ports/customer-identity.port.js";
import type {
  IdentityToProvision,
  LoginMethod,
  ProvisionedIdentity,
} from "../src/b2b/account/domain/ports/customer-identity.port.js";
import { CustomerRole, UserStatus } from "../src/platform/database/client/client.js";
import { StaffIdentityPort } from "../src/staff/invitations/staff-identity.port.js";
import { randomUUID } from "node:crypto";
import { placeOrderPayloadSchema } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { PlaceOrderCommand } from "../src/b2b/orders/application/commands/place-order.command.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const INVITATION_SUB = "auth0|invitation-expiree";
const ADDRESS = "pro@invitation-expiree.fr";

/** Le fournisseur d'identité client, doublé : un lien, rien d'autre. */
class IdentityDouble extends CustomerIdentityPort {
  changeEmail(): Promise<void> {
    return Promise.resolve();
  }
  provision(_input: IdentityToProvision): Promise<ProvisionedIdentity> {
    return Promise.resolve({ subject: INVITATION_SUB, passwordSetupUrl: "https://t.test/neuf" });
  }
  issuePasswordLink(): Promise<string> {
    return Promise.resolve("https://t.test/lien");
  }
  listLoginMethods(): Promise<readonly LoginMethod[]> {
    return Promise.resolve([]);
  }
  linkLoginMethod(): Promise<readonly LoginMethod[]> {
    return Promise.resolve([]);
  }
  unlinkLoginMethod(): Promise<readonly LoginMethod[]> {
    return Promise.resolve([]);
  }
  sendPasswordResetLink(): Promise<void> {
    return Promise.resolve();
  }
}

/** Le jeton staff EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const stubStaffIdentity = {
  provision: (input: { email: string }): Promise<{ subject: string; passwordSetupUrl: string }> =>
    Promise.resolve({ subject: `auth0|${input.email}`, passwordSetupUrl: "https://t.test/s" }),
  issuePasswordLink: (): Promise<string> => Promise.resolve("https://t.test/s-lien"),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CustomerIdentityPort, value: new IdentityDouble() },
      { token: StaffIdentityPort, value: stubStaffIdentity },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Une invitation émise il y a trois semaines : au-delà des 7 jours. */
const EXPIRED_AT = (): Date => new Date(daysAgo(21));
/** Une invitation d'hier : elle vit. */
const LIVE_AT = (): Date => new Date(daysAgo(1));

function resolve(token: VerifiedToken) {
  return ctx.app.get(PrincipalResolver).resolve(token);
}

/** Une personne invitée, rattachée à chaque société avec l'invitation donnée. */
async function invitedTo(
  ...invitations: { companyId: string; invitedAt: Date }[]
): Promise<string> {
  const user = await createUser(ctx.prisma, {
    auth0Sub: INVITATION_SUB,
    email: ADDRESS,
    firstName: "Pierre",
    lastName: "Marchand",
    status: UserStatus.invited,
  });
  for (const { companyId, invitedAt } of invitations) {
    await attachTo(ctx.prisma, user.id, companyId, CustomerRole.admin);
    await ctx.prisma.membership.update({
      where: { userId_companyId: { userId: user.id, companyId } },
      data: { invitedAt },
    });
  }
  return user.id;
}

async function membershipOf(userId: string, companyId: string) {
  return ctx.prisma.membership.findUniqueOrThrow({
    where: { userId_companyId: { userId, companyId } },
    select: { invitedAt: true, acceptedAt: true },
  });
}

describe("client — une invitation expirée n'ouvre plus rien", () => {
  it("🔴 invitée expirée qui entre par code (sub inconnu) : refusée, reste `invited`, rien ne s'ouvre", async () => {
    const company = await createCompany(ctx.prisma);
    const userId = await invitedTo({ companyId: company.id, invitedAt: EXPIRED_AT() });

    await expect(
      resolve({ subject: "email|code-neuf", scopes: [], email: ADDRESS, emailVerified: true }),
    ).rejects.toMatchObject({
      code: "account.invitation.expired",
      message:
        "Votre invitation a expiré. Demandez un nouvel accès à votre interlocuteur La Folie Coffee.",
    });
    await ctx.drain();

    // La transaction est défaite : ni `sub` réécrit, ni statut, ni acceptation.
    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored).toMatchObject({ auth0Sub: INVITATION_SUB, status: UserStatus.invited });
    expect((await membershipOf(userId, company.id)).acceptedAt).toBeNull();
    expect(await ctx.prisma.user.count({ where: { auth0Sub: "email|code-neuf" } })).toBe(0);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "user.entry_refused_invitation_expired" },
      select: { subjectId: true, payload: true },
    });
    expect(facts).toEqual([{ subjectId: userId, payload: { subjectLabel: "Pierre Marchand" } }]);
    expect(JSON.stringify(facts)).not.toContain("|");

    const bells = await ctx.prisma.staffNotification.findMany({
      where: { kind: "account.invitation_expired" },
      select: { audience: true, link: true },
    });
    expect(bells).toEqual([
      { audience: "b2b_companies:write", link: `/comptes-clients/${company.id}` },
    ]);
  });

  it("une invitée expirée qui réessaie ne fait sonner la cloche qu'une fois", async () => {
    const company = await createCompany(ctx.prisma);
    await invitedTo({ companyId: company.id, invitedAt: EXPIRED_AT() });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(resolve({ subject: INVITATION_SUB, scopes: [] })).rejects.toMatchObject({
        code: "account.invitation.expired",
      });
    }
    await ctx.drain();

    expect(
      await ctx.prisma.staffNotification.count({ where: { kind: "account.invitation_expired" } }),
    ).toBe(1);
  });

  it("🔴 invitée expirée par le lien (sub connu) : refusée, reste `invited`", async () => {
    const company = await createCompany(ctx.prisma);
    const userId = await invitedTo({ companyId: company.id, invitedAt: EXPIRED_AT() });

    const response = await ctx.asSub(INVITATION_SUB).get("/me");

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "account.invitation.expired" });
    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.status).toBe(UserStatus.invited);
  });

  it("invitation vivante : entre, `accepted_at` posé, la personne devient active", async () => {
    const company = await createCompany(ctx.prisma);
    const userId = await invitedTo({ companyId: company.id, invitedAt: LIVE_AT() });

    const principal = await resolve({ subject: INVITATION_SUB, scopes: [] });

    expect(principal.memberships).toEqual([{ companyId: company.id, role: CustomerRole.admin }]);
    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.status).toBe(UserStatus.active);
    expect((await membershipOf(userId, company.id)).acceptedAt).not.toBeNull();
  });

  it("invitation vivante par code : le `sub` est rattaché, `accepted_at` posé", async () => {
    const company = await createCompany(ctx.prisma);
    const userId = await invitedTo({ companyId: company.id, invitedAt: LIVE_AT() });

    await resolve({ subject: "email|code-neuf", scopes: [], email: ADDRESS, emailVerified: true });

    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored).toMatchObject({ auth0Sub: "email|code-neuf", status: UserStatus.active });
    expect((await membershipOf(userId, company.id)).acceptedAt).not.toBeNull();
  });

  it("🔴 active par B, A expirée : A ne s'ouvre pas", async () => {
    const companyA = await createCompany(ctx.prisma);
    const companyB = await createCompany(ctx.prisma);
    const userId = await invitedTo(
      { companyId: companyA.id, invitedAt: EXPIRED_AT() },
      { companyId: companyB.id, invitedAt: LIVE_AT() },
    );

    // Entrée par B…
    const first = await resolve({ subject: INVITATION_SUB, scopes: [] });
    // … et à chaque requête suivante, A reste fermée.
    const again = await resolve({ subject: INVITATION_SUB, scopes: [] });

    for (const principal of [first, again]) {
      expect(principal.memberships.map((m) => m.companyId)).toEqual([companyB.id]);
    }
    expect((await membershipOf(userId, companyA.id)).acceptedAt).toBeNull();
    expect((await membershipOf(userId, companyB.id)).acceptedAt).not.toBeNull();
  });

  it("🔴 un lien remis pour B renouvelle B, pas A", async () => {
    const companyA = await createCompany(ctx.prisma);
    const companyB = await createCompany(ctx.prisma);
    const userId = await invitedTo(
      { companyId: companyA.id, invitedAt: EXPIRED_AT() },
      { companyId: companyB.id, invitedAt: EXPIRED_AT() },
    );
    const aBefore = await membershipOf(userId, companyA.id);

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/access-pending/${userId}/link`)
      .send({ companyId: companyB.id })
      .expect(201);

    expect(await membershipOf(userId, companyA.id)).toEqual(aBefore);
    const b = await membershipOf(userId, companyB.id);
    expect(b.invitedAt.getTime()).toBeGreaterThan(LIVE_AT().getTime());

    const principal = await resolve({ subject: INVITATION_SUB, scopes: [] });
    expect(principal.memberships.map((m) => m.companyId)).toEqual([companyB.id]);
  });

  it("un lien demandé pour une société sans invitation en attente est refusé, sans rien renouveler", async () => {
    const companyA = await createCompany(ctx.prisma);
    const other = await createCompany(ctx.prisma);
    const userId = await invitedTo({ companyId: companyA.id, invitedAt: EXPIRED_AT() });
    const before = await membershipOf(userId, companyA.id);

    const response = await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/access-pending/${userId}/link`)
      .send({ companyId: other.id });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "account.invitation.not_found" });
    expect(await membershipOf(userId, companyA.id)).toEqual(before);
  });
});

/**
 * Régression (2026-10-10) : le `Principal` fermait A, mais six gardes relisaient
 * le rattachement en base par le `companyId` de l'URL, et `GET /me` listait A.
 */
describe("client — active par B, A expirée : AUCUNE porte de A ne s'ouvre", () => {
  const RIB = {
    iban: "FR1420041010050500013M02606",
    bic: "CEPAFRPP751",
    holder: "Refuge du Col SARL",
    line1: "12 rue des Alpages",
    line2: "",
    postalCode: "73150",
    city: "Val d'Isère",
    countryCode: "FR",
  };

  async function enteredByB(): Promise<{ userId: string; a: string; b: string }> {
    const a = (await createCompany(ctx.prisma)).id;
    const b = (await createCompany(ctx.prisma)).id;
    const userId = await invitedTo(
      { companyId: a, invitedAt: EXPIRED_AT() },
      { companyId: b, invitedAt: LIVE_AT() },
    );
    // Rôle facturation partout : il aurait le droit de déposer un RIB à A.
    await ctx.prisma.membership.updateMany({
      where: { userId },
      data: { role: CustomerRole.billing },
    });
    // Entre par B.
    await ctx.asSub(INVITATION_SUB).get("/me").expect(200);
    return { userId, a, b };
  }

  it("GET /me ne liste pas A", async () => {
    const { a, b } = await enteredByB();

    const response = await ctx.asSub(INVITATION_SUB).get("/me").expect(200);
    const ids = (response.body as { companies: { id: string }[] }).companies.map((c) => c.id);

    expect(ids).toEqual([b]);
    expect(ids).not.toContain(a);
  });

  it("PUT /companies/A/bank-account est refusé, et rien n'est écrit", async () => {
    const { a, b } = await enteredByB();

    await ctx.asSub(INVITATION_SUB).put(`/companies/${a}/bank-account`).send(RIB).expect(404);
    // Témoin : la même requête sur B passe — le refus vient bien de l'invitation.
    await ctx.asSub(INVITATION_SUB).put(`/companies/${b}/bank-account`).send(RIB).expect(204);
    expect(await ctx.prisma.companyBankAccount.count({ where: { companyId: a } })).toBe(0);
  });

  it("les commandes de A ne se lisent pas, et une commande pour A est refusée", async () => {
    const { userId, a } = await enteredByB();

    const list = await ctx.asSub(INVITATION_SUB).get(`/companies/${a}/orders`);
    expect(list.status).toBe(404);

    await expect(
      ctx.app.get(CommandBus).execute(
        new PlaceOrderCommand(
          userId,
          placeOrderPayloadSchema.parse({
            idempotencyKey: randomUUID(),
            pickupAddressId: "pickup-quelconque",
            requestedDeliveryDate: serviceDay(),
            fulfillmentMethod: "pickup",
            note: "",
            lines: [{ sku: "SKU-QUELCONQUE", quantity: 1 }],
          }),
          a,
        ),
      ),
    ).rejects.toMatchObject({ code: "orders.company.not_found" });
    expect(await ctx.prisma.order.count({ where: { companyId: a } })).toBe(0);
  });
});

describe("staff — une invitation expirée n'ouvre plus rien", () => {
  async function invitedFiche(invitedAt: Date): Promise<string> {
    const fiche = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Paul",
        lastName: "Girard",
        email: "paul@lfc.test",
        role: "comptabilite",
        status: "invited",
        auth0Id: "auth0|paul@lfc.test",
        invitedAt,
      },
    });
    return fiche.id;
  }

  it("🔴 staff invité expiré : refusé, reste `invited`, le dit au journal et à la cloche", async () => {
    const id = await invitedFiche(EXPIRED_AT());

    const response = await ctx.asSub("auth0|paul@lfc.test").get("/admin/me");
    await ctx.drain();

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "staff.invitation.expired",
      message: "Votre accès a expiré. Demandez à un administrateur de vous le rouvrir.",
    });
    const row = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("invited");
    expect(
      await ctx.prisma.activityEvent.findMany({
        where: { type: "staff_user.entry_refused_invitation_expired" },
        select: { subjectId: true, actorId: true },
      }),
    ).toEqual([{ subjectId: id, actorId: id }]);
    expect(
      await ctx.prisma.staffNotification.findMany({
        where: { kind: "staff.invitation_expired" },
        select: { audience: true },
      }),
    ).toEqual([{ audience: "staff_access:write" }]);
  });

  it("staff : un lien neuf renouvelle, et la fiche entre", async () => {
    const id = await invitedFiche(EXPIRED_AT());

    await ctx.asSub(E2E_STAFF_SUB).post(`/admin/staff-access-pending/${id}/link`).expect(201);
    await ctx.asSub("auth0|paul@lfc.test").get("/admin/me").expect(200);

    const row = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("active");
    expect(row.invitedAt?.getTime()).toBeGreaterThan(LIVE_AT().getTime());
  });
});
