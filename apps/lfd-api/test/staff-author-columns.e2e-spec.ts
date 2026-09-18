/**
 * E2E de la **recopie des colonnes d'auteur** — la migration
 * `20260918200000_colonnes_d_auteur_par_fiche`, rejouée sur une base semée.
 * Plan : `documentation/staff/plan-l-auteur-est-la-fiche.md` — D8, D9, étape 5A.
 *
 * Ce que seul le vrai SQL prouve : qu'une ligne écrite par l'instance d'avant
 * (l'ancienne colonne seule) reçoit sa jumelle ; qu'une jumelle déjà remplie
 * n'est pas écrasée ; et que le rejeu ne change rien.
 *
 * Depuis 5B, la scène s'écrit et se relit en SQL brut (`staff-author-columns-scene`) :
 * Prisma ne connaît plus les anciennes colonnes. Que le code n'écrive plus que
 * la nouvelle se prouve dans les suites de chaque route (`feature-access`,
 * `delivery-availability`, `client-notes`, `admin-company-pieces`,
 * `staff-notification-authors`).
 */
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import {
  COPIED,
  migrationStatements,
  runStatements,
  seedOldForm,
  snapshot,
} from "./staff-author-columns-scene.js";

/**
 * Les seules recopies : les `ALTER` et l'index sont déjà appliqués par
 * `db:test:setup`, les rejouer échouerait.
 */
const COPY = migrationStatements("20260918200000_colonnes_d_auteur_par_fiche", "UPDATE", 7);

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

describe("la recopie vers les colonnes d'auteur par fiche (5A)", () => {
  it("remplit la jumelle vide, laisse celle qui est remplie, et un nul reste nul", async () => {
    const rows = await seedOldForm(ctx.prisma);

    await runStatements(ctx.prisma, COPY);

    expect(await snapshot(ctx.prisma, rows)).toEqual(COPIED);
  });

  it("rejouée, ne change rien", async () => {
    const rows = await seedOldForm(ctx.prisma);
    await runStatements(ctx.prisma, COPY);
    const once = await snapshot(ctx.prisma, rows);

    await runStatements(ctx.prisma, COPY);

    expect(await snapshot(ctx.prisma, rows)).toEqual(once);
  });
});
