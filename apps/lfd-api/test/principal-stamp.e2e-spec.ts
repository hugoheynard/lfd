/**
 * E2E du **principal gardé en mémoire** —
 * `documentation/caching-usage/qui-est-le-client.md`, « L'estampille et ses déclencheurs ».
 *
 * Ce que seule la base migrée peut dire : les trois déclencheurs existent et
 * font monter l'estampille, y compris sous une écriture SQL à la main ; et un
 * changement de compte, d'adhésion ou de site se voit à la requête suivante,
 * malgré la mémoire.
 */
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { CompanyStatus, CustomerRole, UserStatus } from "../src/platform/database/client/client.js";
import { CommandBus } from "@nestjs/cqrs";
import { UpdateIdentityByStaffCommand } from "../src/b2b/account/application/commands/update-identity-by-staff.command.js";
import { CompanyRepository } from "../src/b2b/account/domain/ports/company.repository.js";
import { Clock } from "../src/platform/time/clock.js";
import { PrincipalResolver } from "../src/platform/auth/principal.resolver.js";
import type { Principal } from "../src/platform/auth/principal.js";

const SUB = "auth0|stamp";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

function resolve(): Promise<Principal> {
  return ctx.app.get(PrincipalResolver).resolve({ subject: SUB, scopes: [] });
}

async function stamp(): Promise<bigint> {
  const row = await ctx.prisma.principalStamp.findUniqueOrThrow({ where: { id: 1 } });
  return row.value;
}

/** Une personne active, rattachée et entrée : sa résolution suivante se garde. */
async function enteredMember(): Promise<{ userId: string; companyId: string }> {
  const company = await createCompany(ctx.prisma);
  const user = await createUser(ctx.prisma, { auth0Sub: SUB });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  // La première résolution accepte l'invitation (une écriture) : elle ne se garde pas.
  await resolve();
  return { userId: user.id, companyId: company.id };
}

describe("l'estampille du principal — les déclencheurs", () => {
  it("chacune des trois tables porte son déclencheur BEFORE, par instruction, sur les trois gestes", async () => {
    const rows = await ctx.prisma.$queryRaw<{ table: string; tgtype: number; tgenabled: string }[]>`
      SELECT c.relname AS "table", t.tgtype::int AS tgtype, t.tgenabled::text AS tgenabled
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE n.nspname = 'public' AND p.proname = 'principal_stamp_bump' AND NOT t.tgisinternal
       ORDER BY c.relname`;
    // tgtype : 1 = par ligne, 2 = BEFORE, 4 = INSERT, 8 = DELETE, 16 = UPDATE.
    expect(rows.map((row) => row.table)).toEqual(["companies", "memberships", "users"]);
    for (const row of rows) {
      expect(row.tgtype & 1).toBe(0);
      expect(row.tgtype & (2 | 4 | 8 | 16)).toBe(2 | 4 | 8 | 16);
      expect(row.tgenabled).toBe("O");
    }
  });

  it("une écriture SQL à la main sur `memberships` fait monter l'estampille", async () => {
    const { userId } = await enteredMember();
    const before = await stamp();
    await ctx.prisma.$executeRaw`
      UPDATE "public"."memberships" SET "role" = 'orders' WHERE "user_id" = ${userId}`;
    expect(await stamp()).toBe(before + 1n);
  });
});

/**
 * Le filtre par colonnes (« La liste des colonnes, tenue par un test », migration
 * `20261105120000_l_estampille_filtree_par_colonnes`) : une première connexion
 * ou une écriture d'identité de société vidait le cache de tout le monde.
 */
describe("l'estampille du principal — les colonnes qui la font monter", () => {
  it("la première connexion (`first_login_at`) ne la fait plus monter", async () => {
    const { userId } = await enteredMember();
    const before = await stamp();
    await ctx.prisma.$executeRaw`
      UPDATE "public"."users" SET "first_login_at" = now() WHERE "id" = ${userId}`;
    expect(await stamp()).toBe(before);
  });

  it("une écriture d'identité de société (raison sociale) ne la fait plus monter", async () => {
    const { companyId } = await enteredMember();
    const before = await stamp();
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { raisonSociale: "Autre raison sociale" },
    });
    expect(await stamp()).toBe(before);
  });

  /**
   * Régression : `PrismaCompanyRepository.save` réécrivait `status` à chaque
   * sauvegarde ; une correction d'identité par l'agrégat faisait donc monter
   * l'estampille malgré le filtre (2026-11-05).
   */
  it("une correction d'identité par l'agrégat (handler staff) ne la fait plus monter", async () => {
    const { companyId } = await enteredMember();
    const before = await stamp();
    await ctx.app.get(CommandBus).execute(
      new UpdateIdentityByStaffCommand(companyId, {
        enseigne: "Nouvelle enseigne",
        vatNumber: "",
        raisonSociale: "",
        formeJuridique: "",
        siret: "",
        siren: "",
      }),
    );
    const row = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(row.enseigne).toBe("Nouvelle enseigne");
    expect(await stamp()).toBe(before);
  });

  it("une activation par l'agrégat la fait monter", async () => {
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
    const repository = ctx.app.get(CompanyRepository);
    const loaded = await repository.load(company.id);
    expect(loaded).not.toBeNull();
    if (loaded === null) {
      return;
    }
    const before = await stamp();
    loaded.activate(ctx.app.get(Clock).now(), true, {
      staffUserId: "staff_e2e",
      name: "E2E",
      role: "commercial",
    });
    await repository.save(loaded);
    expect(await stamp()).toBe(before + 1n);
  });

  it.each([
    [
      "users.status",
      `UPDATE "public"."users" SET "status" = 'disabled' WHERE "auth0_sub" = '${SUB}'`,
    ],
    [
      "users.email_verified",
      `UPDATE "public"."users" SET "email_verified" = NOT "email_verified" WHERE "auth0_sub" = '${SUB}'`,
    ],
    ["memberships.accepted_at", `UPDATE "public"."memberships" SET "accepted_at" = NULL`],
    ["companies.parent_company_id", `UPDATE "public"."companies" SET "parent_company_id" = NULL`],
  ])("une écriture sur %s la fait monter", async (_column, sql) => {
    await enteredMember();
    const before = await stamp();
    await ctx.prisma.$executeRawUnsafe(sql);
    expect(await stamp()).toBe(before + 1n);
  });

  it("INSERT et DELETE la font monter, sur les trois tables", async () => {
    const before = await stamp();
    const company = await createCompany(ctx.prisma);
    const user = await createUser(ctx.prisma, { auth0Sub: SUB });
    await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
    const inserted = await stamp();
    expect(inserted).toBeGreaterThanOrEqual(before + 3n);
    await ctx.prisma.$executeRaw`DELETE FROM "public"."memberships" WHERE "user_id" = ${user.id}`;
    expect(await stamp()).toBe(inserted + 1n);
    // La cascade vers `memberships` est une instruction de plus : au moins un.
    await ctx.prisma.$executeRaw`DELETE FROM "public"."users" WHERE "id" = ${user.id}`;
    const userDeleted = await stamp();
    expect(userDeleted).toBeGreaterThan(inserted + 1n);
    await ctx.prisma.$executeRaw`DELETE FROM "public"."companies" WHERE "id" = ${company.id}`;
    expect(await stamp()).toBeGreaterThan(userDeleted);
  });
});

describe("le principal gardé en mémoire", () => {
  /**
   * La preuve que la mémoire SERT : déclencheur suspendu le temps d'une
   * écriture, la résolution suivante rend l'ancien e-mail. Rétabli aussitôt.
   */
  it("est gardé tant que l'estampille ne bouge pas", async () => {
    const { userId } = await enteredMember();
    await resolve();
    await ctx.prisma.$executeRawUnsafe(
      `ALTER TABLE "public"."users" DISABLE TRIGGER "users_principal_stamp"`,
    );
    try {
      await ctx.prisma.user.update({ where: { id: userId }, data: { email: "autre@test.fr" } });
    } finally {
      await ctx.prisma.$executeRawUnsafe(
        `ALTER TABLE "public"."users" ENABLE TRIGGER "users_principal_stamp"`,
      );
    }
    expect((await resolve()).email).toBe(`${SUB}@test.fr`);
  });

  it("désactiver un compte coupe la requête suivante", async () => {
    const { userId } = await enteredMember();
    await ctx.asSub(SUB).get("/me").expect(200);
    await ctx.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.disabled },
    });
    const response = await ctx.asSub(SUB).get("/me");
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ message: "Compte non actif." });
  });

  it("retirer une adhésion la retire du principal suivant", async () => {
    const { userId, companyId } = await enteredMember();
    expect((await resolve()).memberships).toEqual([{ companyId, role: CustomerRole.owner }]);
    await ctx.prisma.membership.delete({ where: { userId_companyId: { userId, companyId } } });
    expect((await resolve()).memberships).toEqual([]);
  });

  it("suspendre un site le retire des sites atteints", async () => {
    const { companyId } = await enteredMember();
    const site = await createCompany(ctx.prisma);
    await ctx.prisma.company.update({
      where: { id: site.id },
      data: { parentCompanyId: companyId },
    });
    expect((await resolve()).reachableCompanyIds).toEqual([site.id]);
    await ctx.prisma.company.update({
      where: { id: site.id },
      data: { status: CompanyStatus.suspended },
    });
    expect((await resolve()).reachableCompanyIds).toEqual([]);
  });
});
