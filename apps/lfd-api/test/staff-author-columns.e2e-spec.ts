/**
 * E2E de la **recopie des colonnes d'auteur** — la migration
 * `20260918200000_colonnes_d_auteur_par_fiche`, rejouée sur une base semée.
 * Plan : `documentation/staff/plan-l-auteur-est-la-fiche.md` — D8, D9, étape 5A.
 *
 * Ce que seul le vrai SQL prouve : qu'une ligne écrite par l'instance d'avant
 * (l'ancienne colonne seule) reçoit sa jumelle ; qu'une jumelle déjà remplie
 * n'est pas écrasée ; et que le rejeu — celui de 5B, qui recopie encore — ne
 * change rien.
 *
 * 🔴 Les lignes « forme ancienne » s'écrivent en Prisma direct : depuis 5A,
 * aucun chemin du domaine n'écrit plus une ligne sans sa jumelle. Ce que la
 * production contient et que le code ne peut plus produire ne se sème que par
 * la base. Que le code écrive les DEUX colonnes se prouve, lui, dans les suites
 * de chaque route (`feature-access`, `delivery-availability`, `client-notes`,
 * `admin-company-pieces`, `staff-notification-authors`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bootstrapE2e, daysAgo, E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260918200000_colonnes_d_auteur_par_fiche/migration.sql",
);

/** Une valeur qu'une ligne portait DÉJÀ dans sa jumelle : la recopie la laisse. */
const ALREADY_THERE = "fiche-deja-ecrite";

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

/**
 * Les seules instructions de recopie : les `ALTER` et l'index sont déjà
 * appliqués par `db:test:setup`, les rejouer échouerait. On éprouve CE SQL-là,
 * pas une copie.
 */
function copyStatements(): readonly string[] {
  const statements = readFileSync(MIGRATION, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.startsWith("UPDATE"));
  if (statements.length !== 7) {
    throw new Error("La migration ne porte plus sept recopies : relire le fichier.");
  }
  return statements;
}

async function runCopy(): Promise<void> {
  const statements = copyStatements();
  await ctx.prisma.$transaction(async (tx) => {
    for (const statement of statements) {
      await tx.$executeRawUnsafe(statement);
    }
  });
}

async function seedOldForm(): Promise<string> {
  await ctx.prisma.featureAccessOverride.create({
    data: {
      key: "shop",
      value: "browse",
      updatedAt: new Date(daysAgo(2)),
      updatedBySub: E2E_STAFF_ID,
      updatedByName: "Opérateur E2E",
      updatedByRole: "admin",
    },
  });
  await ctx.prisma.staffPushSubscription.create({
    data: {
      id: "abonnement-1",
      endpoint: "https://push.exemple.test/1",
      p256dh: "cle-publique",
      auth: "secret",
      staffSub: E2E_STAFF_ID,
    },
  });
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Marais SAS" });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: {
      activatedAt: new Date(daysAgo(3)),
      activatedBySub: E2E_STAFF_ID,
      activatedByStaffId: ALREADY_THERE,
    },
  });
  return company.id;
}

async function snapshot(companyId: string): Promise<unknown> {
  return Promise.all([
    ctx.prisma.featureAccessOverride.findUniqueOrThrow({
      where: { key: "shop" },
      select: { updatedBySub: true, updatedByStaffId: true },
    }),
    ctx.prisma.staffPushSubscription.findUniqueOrThrow({
      where: { id: "abonnement-1" },
      select: { staffSub: true, staffUserId: true },
    }),
    ctx.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: {
        activatedBySub: true,
        activatedByStaffId: true,
        kbisCertifiedBySub: true,
        kbisCertifiedByStaffId: true,
      },
    }),
  ]);
}

describe("la recopie vers les colonnes d'auteur par fiche", () => {
  it("remplit la jumelle vide, laisse celle qui est remplie, et un nul reste nul", async () => {
    const companyId = await seedOldForm();

    await runCopy();

    expect(await snapshot(companyId)).toEqual([
      { updatedBySub: E2E_STAFF_ID, updatedByStaffId: E2E_STAFF_ID },
      { staffSub: E2E_STAFF_ID, staffUserId: E2E_STAFF_ID },
      {
        activatedBySub: E2E_STAFF_ID,
        activatedByStaffId: ALREADY_THERE,
        kbisCertifiedBySub: null,
        kbisCertifiedByStaffId: null,
      },
    ]);
  });

  it("rejouée, ne change rien", async () => {
    const companyId = await seedOldForm();
    await runCopy();
    const once = await snapshot(companyId);

    await runCopy();

    expect(await snapshot(companyId)).toEqual(once);
  });
});
