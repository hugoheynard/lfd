/**
 * E2E du **cycle d'accès** vu du backend, via `GET /me` : app NestJS complète
 * (guard global + resolver + endpoint) devant un **vrai** Postgres.
 *
 * register / login / logout au sens UI appartiennent à Auth0. Côté backend, ce
 * sont des **états du `User` en base** — et c'est ce que cette suite exerce, en
 * écrivant et relisant réellement ces états. Tout l'enjeu du design
 * **DB-autoritaire** est là : le jeton n'atteste que le `sub`, la base décide
 * l'autorisation, donc révoquer en base bloque *immédiatement* même avec un
 * jeton encore parfaitement valide.
 */
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { CustomerRole, UserStatus } from "../src/infra/database/client/client.js";
import type { AccountView } from "../src/account/domain/ports/account.reader.js";

const SUB = "auth0|lifecycle";

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

describe("GET /me — la porte d'entrée", () => {
  it("refuse une requête sans jeton (guard global, secure-by-default)", async () => {
    const response = await ctx.http().get("/me");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ message: "Jeton Bearer manquant." });
  });

  it("refuse un jeton dont la signature ne passe pas, sans détailler pourquoi", async () => {
    const response = await ctx.asSub("invalid-token").get("/me");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ message: "Jeton invalide ou expiré." });
  });
});

describe("GET /me — le cycle se joue en base", () => {
  it("provisionne (JIT) un sub valide inconnu et renvoie 200 (zéro friction)", async () => {
    const response = await ctx.asSub("auth0|jamais-vu").get("/me");

    // Zéro friction : la 1re requête d'un sub inconnu **crée** le compte (actif,
    // sans société) plutôt que de le refuser — cf. le provisioning JIT du resolver.
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ companies: [] });
    const provisioned = await ctx.prisma.user.findUniqueOrThrow({
      where: { auth0Sub: "auth0|jamais-vu" },
    });
    expect(provisioned.status).toBe("active");
  });

  it("refuse un compte seulement invité (provisionné, pas activé)", async () => {
    await createUser(ctx.prisma, { auth0Sub: SUB, status: UserStatus.invited });

    const response = await ctx.asSub(SUB).get("/me");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ message: "Compte non actif." });
  });

  it("renvoie le profil lu en base pour un compte actif", async () => {
    const user = await createUser(ctx.prisma, {
      auth0Sub: SUB,
      email: "gerant@client-cycle.fr",
      firstName: "Camille",
      lastName: "Rousseau",
      phone: "01 42 71 08 44",
    });

    const response = await ctx.asSub(SUB).get("/me").expect(200);

    // Chaque champ vient de la LIGNE en base, pas d'un claim du jeton.
    expect(response.body).toEqual({
      profile: {
        userId: user.id,
        subject: SUB,
        firstName: "Camille",
        lastName: "Rousseau",
        email: "gerant@client-cycle.fr",
        phone: "01 42 71 08 44",
      },
      companies: [],
      // Préférences de navigation (bag nav_prefs) : défaut sans choix explicite.
      navPrefs: { catalogueView: null },
    });
  });

  it("bloque dès la requête suivante un compte désactivé en base, à jeton inchangé", async () => {
    await createUser(ctx.prisma, { auth0Sub: SUB });
    await ctx.asSub(SUB).get("/me").expect(200);

    // Le « logout » qui compte : la révocation côté base, pas côté client.
    await ctx.prisma.user.update({
      where: { auth0Sub: SUB },
      data: { status: UserStatus.disabled },
    });

    const response = await ctx.asSub(SUB).get("/me");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ message: "Compte non actif." });
  });
});

describe("GET /me — mes entreprises", () => {
  it("authentifie une personne sans aucune entreprise (l'état de départ)", async () => {
    // Cet état était irreprésentable avant (`users.company_id` NOT NULL). Il est
    // désormais celui d'un compte tout juste créé, et c'est lui qui déclenche
    // l'empty state « Mes entreprises » côté front : s'il renvoyait 401, la page
    // serait inatteignable.
    await createUser(ctx.prisma, { auth0Sub: SUB });

    const response = await ctx.asSub(SUB).get("/me").expect(200);

    expect(response.body).toMatchObject({ companies: [] });
  });

  it("liste les entreprises de la personne avec son rôle dans chacune", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: SUB });
    const premiere = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie A SAS" });
    const seconde = await createCompany(ctx.prisma, {
      raisonSociale: "Torréfaction B SARL",
      siret: "98765432100023",
    });
    await attachTo(ctx.prisma, user.id, premiere.id, CustomerRole.owner);
    await attachTo(ctx.prisma, user.id, seconde.id, CustomerRole.orders);

    const response = await ctx.asSub(SUB).get("/me").expect(200);

    // Gestionnaire ici, membre là : le rôle appartient au rattachement.
    expect(jsonBody<AccountView>(response).companies).toEqual([
      expect.objectContaining({ id: premiere.id, role: "owner" }),
      expect.objectContaining({ id: seconde.id, role: "orders" }),
    ]);
  });

  it("ne montre à personne les entreprises d'une autre (isolation)", async () => {
    const moi = await createUser(ctx.prisma, { auth0Sub: "auth0|moi" });
    const autre = await createUser(ctx.prisma, { auth0Sub: "auth0|autre" });
    const laMienne = await createCompany(ctx.prisma, { raisonSociale: "La Mienne SAS" });
    const laSienne = await createCompany(ctx.prisma, {
      raisonSociale: "La Sienne SARL",
      siret: "98765432100023",
    });
    await attachTo(ctx.prisma, moi.id, laMienne.id);
    await attachTo(ctx.prisma, autre.id, laSienne.id);

    const mine = await ctx.asSub("auth0|moi").get("/me").expect(200);

    expect(jsonBody<AccountView>(mine).companies).toEqual([
      expect.objectContaining({ id: laMienne.id }),
    ]);
    expect(JSON.stringify(mine.body)).not.toContain(laSienne.id);
    expect(JSON.stringify(mine.body)).not.toContain("La Sienne");
  });
});
