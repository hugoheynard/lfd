/**
 * E2E du **schéma** : les garanties que seule la base peut donner.
 *
 * Ces invariants ne vivent pas dans du code applicatif — ils vivent dans le SQL
 * produit par les migrations. Un test à Prisma stubbé les tiendrait pour acquis ;
 * ici on vérifie qu'ils sont réellement dans la base que la prod recevra.
 */
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createGuest, createUser } from "./factories.js";

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

describe("contraintes de la db commerce", () => {
  it("interdit qu'une même identité Auth0 désigne deux personnes", async () => {
    // Sans cette contrainte, le resolver trouverait deux `User` pour un `sub` et
    // l'identité — donc l'autorisation — deviendrait ambiguë.
    await createUser(ctx.prisma, { auth0Sub: "auth0|unique" });

    await expect(createUser(ctx.prisma, { auth0Sub: "auth0|unique" })).rejects.toThrow();
  });

  it("laisse coexister autant d'INVITÉS qu'il en vient", async () => {
    // Un invité n'a aucune identité de connexion (plan
    // `plan-commande-sans-compte.md`, D1) : sa colonne `auth0_sub` est nulle.
    // Deux `NULL` ne s'apparient pas dans un index unique Postgres — c'est ce
    // qui permet à l'unicité ci-dessus de survivre à la bascule, et c'est une
    // propriété de la BASE, donc elle ne se vérifie qu'ici.
    await createGuest(ctx.prisma, { email: "visiteur@exemple.fr" });
    await createGuest(ctx.prisma, { email: "autre@exemple.fr" });

    // Et même adresse : `email` n'a aucune unicité, et D2 l'assume — deux
    // lignes, deux histoires.
    await expect(createGuest(ctx.prisma, { email: "visiteur@exemple.fr" })).resolves.toMatchObject({
      auth0Sub: null,
    });
  });

  it("interdit de rattacher deux fois la même personne à la même société", async () => {
    // L'unicité `(user_id, company_id)` : un doublon ferait apparaître deux fois
    // le même onglet dans « Mes entreprises », avec deux rôles possiblement
    // contradictoires pour un seul rattachement réel.
    const societe = await createCompany(ctx.prisma, { raisonSociale: "Premier SAS" });
    const personne = await createUser(ctx.prisma, { auth0Sub: "auth0|double" });
    await attachTo(ctx.prisma, personne.id, societe.id);

    await expect(attachTo(ctx.prisma, personne.id, societe.id)).rejects.toThrow();
  });

  it("interdit un rattachement vers une personne ou une société inexistante", async () => {
    // Les clés étrangères de `memberships` : un rattachement orphelin serait un
    // accès sans mur, ou une société que personne ne peut plus voir.
    const societe = await createCompany(ctx.prisma, { raisonSociale: "Réelle SAS" });
    const personne = await createUser(ctx.prisma, { auth0Sub: "auth0|reel" });

    await expect(attachTo(ctx.prisma, personne.id, "company_inexistante")).rejects.toThrow();
    await expect(attachTo(ctx.prisma, "user_inexistant", societe.id)).rejects.toThrow();
  });

  it("garde l'argent en entiers de centimes, jamais en flottant", async () => {
    const columns = await ctx.prisma.$queryRaw<{ column_name: string; data_type: string }[]>`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name LIKE '%_cents'
    `;

    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns) {
      expect(column.data_type).toBe("integer");
    }
  });
});
