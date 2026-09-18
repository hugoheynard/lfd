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
import { PERSONAL_WORKSPACE } from "@lfd/contracts";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createGuest, createUser } from "./factories.js";
import { CustomerRole, UserStatus } from "../src/platform/database/client/client.js";
import type { AccountView } from "../src/b2b/account/domain/ports/account.reader.js";
import { PrincipalResolver } from "../src/platform/auth/principal.resolver.js";

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

describe("PrincipalResolver — la preuve d'adresse", () => {
  /**
   * Régression : le `Principal` était construit sur la ligne lue AVANT la
   * recopie de la preuve, si bien que la requête qui l'apportait voyait encore
   * `emailProven: false` (2026-09-14).
   *
   * Par le resolver de l'application et non par HTTP : le verifier doublé du
   * harnais ne porte pas le claim `emailVerified`, et aucune route ne rend
   * encore `emailProven`. C'est le vrai resolver, sur la vraie base.
   */
  it("voit l'adresse prouvée dès la requête qui apporte la preuve", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: SUB, emailVerified: false });

    const principal = await ctx.app
      .get(PrincipalResolver)
      .resolve({ subject: SUB, scopes: [], email: user.email, emailVerified: true });

    expect(principal.emailProven).toBe(true);
    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: SUB } });
    expect(stored.emailVerified).toBe(true);
  });
});

/**
 * Régression : « Continuer avec Google » sous l'adresse de son compte ouvrait un
 * SECOND compte, vide (2026-09-17). Par le vrai resolver, sur la vraie base :
 * c'est le pré-filtre `ILIKE` et le mur « connectable » qui comptent ici.
 */
describe("PrincipalResolver — une connexion sociale sous une adresse connue", () => {
  const GOOGLE = "google-oauth2|e2e";

  function resolveGoogle(email: string) {
    return ctx.app
      .get(PrincipalResolver)
      .resolve({ subject: GOOGLE, scopes: [], email, emailVerified: true });
  }

  it("🔴 refuse, sans créer de compte, quand un compte connectable porte l'adresse", async () => {
    await createUser(ctx.prisma, { auth0Sub: SUB, email: "gerant@client-cycle.fr" });

    await expect(resolveGoogle("Gerant@Client-Cycle.fr")).rejects.toMatchObject({
      code: "account.identity.link_required",
    });
    expect(await ctx.prisma.user.count({ where: { auth0Sub: GOOGLE } })).toBe(0);
  });

  it("crée le compte quand l'adresse n'appartient qu'à un acheteur sans compte", async () => {
    // Un acheteur de la boutique n'a pas d'identité de connexion : ce n'est pas
    // un compte, et il ne doit pas fermer la porte à qui prouve la même boîte.
    await createGuest(ctx.prisma, { email: "gerant@client-cycle.fr" });

    await resolveGoogle("gerant@client-cycle.fr");

    expect(await ctx.prisma.user.count({ where: { auth0Sub: GOOGLE } })).toBe(1);
  });

  it("ne confond pas deux adresses que `ILIKE` rapprocherait", async () => {
    await createUser(ctx.prisma, { auth0Sub: SUB, email: "jeanxdupont@client.fr" });

    await resolveGoogle("jean_dupont@client.fr");

    expect(await ctx.prisma.user.count({ where: { auth0Sub: GOOGLE } })).toBe(1);
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

  it("ACTIVE l'invité à sa première requête authentifiée", async () => {
    // Un compte `invited` a été provisionné par le staff et n'a reçu qu'un lien
    // de création de mot de passe : présenter un jeton prouve qu'il l'a suivi.
    // Le refuser laisserait dehors, pour toujours, le client à qui le commercial
    // vient d'ouvrir l'accès.
    await createUser(ctx.prisma, { auth0Sub: SUB, status: UserStatus.invited });

    const response = await ctx.asSub(SUB).get("/me");

    expect(response.status).toBe(200);
    const activated = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: SUB } });
    expect(activated.status).toBe("active");
  });

  it("refuse un compte DÉSACTIVÉ, et ne le réactive pas", async () => {
    // `disabled` est une décision prise sur la personne : rien dans un jeton ne
    // la renverse.
    await createUser(ctx.prisma, { auth0Sub: SUB, status: UserStatus.disabled });

    const response = await ctx.asSub(SUB).get("/me");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ message: "Compte non actif." });
    const untouched = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: SUB } });
    expect(untouched.status).toBe("disabled");
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

    // Chaque champ vient de la LIGNE en base, pas d'un claim du jeton. Le `sub`
    // Auth0 n'y est plus (plan de l'auteur, étape 5A) : `toEqual` le prouve.
    expect(response.body).toEqual({
      profile: {
        userId: user.id,
        firstName: "Camille",
        lastName: "Rousseau",
        email: "gerant@client-cycle.fr",
        phone: "01 42 71 08 44",
      },
      companies: [],
      // Préférences de navigation (bag nav_prefs) : défaut sans choix explicite.
      navPrefs: { catalogueView: null, workspace: null },
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

describe("PATCH /me/nav-prefs — un patch, pas un remplacement", () => {
  const patch = (body: Record<string, unknown>) => ctx.asSub(SUB).patch("/me/nav-prefs").send(body);

  it("accepte la vue seule — ce qu'envoie le front déjà en production", async () => {
    await createUser(ctx.prisma, { auth0Sub: SUB });

    const response = await patch({ catalogueView: "list" }).expect(200);

    expect(jsonBody<AccountView>(response).navPrefs).toEqual({
      catalogueView: "list",
      workspace: null,
    });
  });

  /**
   * Régression : l'écriture remplaçait le sac `nav_prefs` entier, si bien que
   * poser une vue de catalogue effaçait l'espace de travail choisi (2026-09-15).
   */
  it("🔴 poser une vue de catalogue ne perd pas l'espace", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: SUB });
    const company = await createCompany(ctx.prisma);
    await attachTo(ctx.prisma, user.id, company.id);

    await patch({ workspace: company.id }).expect(200);
    const response = await patch({ catalogueView: "shelves" }).expect(200);

    expect(jsonBody<AccountView>(response).navPrefs).toEqual({
      catalogueView: "shelves",
      workspace: company.id,
    });
  });

  it("choisit « perso » sans société, et l'efface avec `null`", async () => {
    await createUser(ctx.prisma, { auth0Sub: SUB });

    const chosen = await patch({ workspace: PERSONAL_WORKSPACE }).expect(200);
    expect(jsonBody<AccountView>(chosen).navPrefs.workspace).toBe(PERSONAL_WORKSPACE);

    const cleared = await patch({ workspace: null }).expect(200);
    expect(jsonBody<AccountView>(cleared).navPrefs.workspace).toBeNull();
  });

  it("🔴 refuse en 409 l'espace d'une société à laquelle on n'appartient pas", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: SUB });
    const mine = await createCompany(ctx.prisma, { raisonSociale: "La Mienne SAS" });
    const theirs = await createCompany(ctx.prisma, {
      raisonSociale: "La Sienne SARL",
      siret: "98765432100023",
    });
    await attachTo(ctx.prisma, user.id, mine.id);

    await patch({ catalogueView: "list", workspace: theirs.id }).expect(409);

    // Rien n'est écrit, pas même la vue qui accompagnait le refus.
    const me = await ctx.asSub(SUB).get("/me").expect(200);
    expect(jsonBody<AccountView>(me).navPrefs).toEqual({ catalogueView: null, workspace: null });
  });

  it("refuse un patch vide — au moins une préférence à changer", async () => {
    await createUser(ctx.prisma, { auth0Sub: SUB });

    await patch({}).expect(400);
  });
});
