/**
 * E2E de la **bascule des colonnes d'auteur** — la migration
 * `20260918210000_bascule_des_colonnes_d_auteur`, rejouée sur une base semée.
 * Plan : `documentation/staff/plan-l-auteur-est-la-fiche.md` — D8, D9, étape 5B.
 *
 * Ce que seul le vrai SQL prouve :
 *
 * - la recopie rattrape ce que l'instance d'avant 5A a écrit après la migration
 *   de 5A (l'ancienne colonne seule), sans écraser une jumelle remplie, et son
 *   rejeu ne change rien ;
 * - après elle, une ligne sans l'ancienne colonne s'insère — c'est ce que font
 *   toutes les écritures de 5B, puisque Prisma ne connaît plus cette colonne ;
 * - et ce sont bien SES `ALTER` qui le permettent, pas un état de la base de
 *   test : remis NOT NULL, les anciennes colonnes redeviennent nullables sous
 *   ses instructions.
 */
import { bootstrapE2e, daysAgo, E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import { legacyAuthorOf, type LegacyAuthorColumn } from "./legacy-author-columns.js";
import {
  COPIED,
  migrationStatements,
  runStatements,
  seedOldForm,
  snapshot,
} from "./staff-author-columns-scene.js";

const MIGRATION = "20260918210000_bascule_des_colonnes_d_auteur";
const COPY = migrationStatements(MIGRATION, "UPDATE", 7);
const RELAX = migrationStatements(MIGRATION, "ALTER", 5);

/** Les cinq anciennes colonnes qui étaient NOT NULL avant 5B. */
const RELAXED_COLUMNS = [
  ["feature_access_overrides", "updated_by_sub"],
  ["feature_access_exemptions", "created_by_sub"],
  ["delivery_settings", "updated_by_sub"],
  ["client_notes", "created_by_sub"],
  ["staff_push_subscriptions", "staff_sub"],
] as const;

/** Lancée pour annuler la transaction d'essai : tout ce qu'elle a fait repart. */
class RollbackProbe extends Error {}

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

describe("la recopie de la bascule (5B)", () => {
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

/**
 * Une ligne par table, écrite par Prisma — qui ne connaît plus l'ancienne
 * colonne et l'omet donc, exactement comme le code de 5B. Rend les clés à
 * relire.
 */
async function writeWithoutOldColumns(): Promise<
  readonly (readonly [LegacyAuthorColumn, string])[]
> {
  const at = new Date(daysAgo(1));
  const author = { name: "Opérateur E2E", role: "admin" };
  await ctx.prisma.featureAccessOverride.create({
    data: {
      key: "shop",
      value: "browse",
      updatedAt: at,
      updatedByStaffId: E2E_STAFF_ID,
      updatedByName: author.name,
      updatedByRole: author.role,
    },
  });
  await ctx.prisma.featureAccessExemption.create({
    data: {
      id: "exemption-1",
      key: "shop",
      email: "testeur@exemple.fr",
      createdAt: at,
      createdByStaffId: E2E_STAFF_ID,
      createdByName: author.name,
      createdByRole: author.role,
    },
  });
  await ctx.prisma.deliveryAvailability.create({
    data: {
      key: "delivery",
      openToB2b: true,
      openToB2c: false,
      updatedAt: at,
      updatedByStaffId: E2E_STAFF_ID,
      updatedByName: author.name,
      updatedByRole: author.role,
    },
  });
  await ctx.prisma.staffPushSubscription.create({
    data: {
      id: "abonnement-1",
      endpoint: "https://push.exemple.test/1",
      p256dh: "cle-publique",
      auth: "secret",
      staffUserId: E2E_STAFF_ID,
    },
  });
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Marais SAS" });
  await ctx.prisma.clientNotebook.create({
    data: {
      id: "carnet-1",
      companyId: company.id,
      notes: {
        create: {
          id: "note-1",
          position: 0,
          title: "Livrer par la cour",
          createdByStaffId: E2E_STAFF_ID,
          createdByName: author.name,
        },
      },
    },
  });
  return [
    ["feature_access_overrides.updated_by_sub", "shop"],
    ["feature_access_exemptions.created_by_sub", "exemption-1"],
    ["delivery_settings.updated_by_sub", "delivery"],
    ["staff_push_subscriptions.staff_sub", "abonnement-1"],
    ["client_notes.created_by_sub", "note-1"],
  ];
}

async function nullableColumns(
  tx: Pick<E2eContext["prisma"], "$queryRaw">,
): Promise<readonly string[]> {
  const rows = await tx.$queryRaw<readonly { readonly name: string }[]>`
    SELECT table_name || '.' || column_name AS name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND is_nullable = 'YES'
      AND (table_name, column_name) IN (
        ('feature_access_overrides', 'updated_by_sub'),
        ('feature_access_exemptions', 'created_by_sub'),
        ('delivery_settings', 'updated_by_sub'),
        ('client_notes', 'created_by_sub'),
        ('staff_push_subscriptions', 'staff_sub'))
    ORDER BY name`;
  return rows.map((row) => row.name);
}

const ALL_RELAXED = RELAXED_COLUMNS.map(([table, column]) => `${table}.${column}`).sort();

describe("le relâchement des anciennes colonnes (5B)", () => {
  it("une ligne écrite sans l'ancienne colonne s'insère, et l'y laisse vide", async () => {
    const written = await writeWithoutOldColumns();

    for (const [which, key] of written) {
      expect(await legacyAuthorOf(ctx.prisma, which, key)).toBeNull();
    }
  });

  it("ce sont SES instructions qui rendent nullables les cinq colonnes NOT NULL", async () => {
    let observed: { before: readonly string[]; after: readonly string[] } | null = null;

    // Tables vides (remises à zéro) : le NOT NULL se repose sans échec. Tout se
    // joue dans une transaction annulée — la base de test en ressort intacte.
    await expect(
      ctx.prisma.$transaction(async (tx) => {
        for (const [table, column] of RELAXED_COLUMNS) {
          await tx.$executeRawUnsafe(
            `ALTER TABLE "public"."${table}" ALTER COLUMN "${column}" SET NOT NULL`,
          );
        }
        const before = await nullableColumns(tx);
        for (const statement of RELAX) {
          await tx.$executeRawUnsafe(statement);
        }
        observed = { before, after: await nullableColumns(tx) };
        throw new RollbackProbe();
      }),
    ).rejects.toBeInstanceOf(RollbackProbe);

    expect(observed).toEqual({ before: [], after: ALL_RELAXED });
    expect(await nullableColumns(ctx.prisma)).toEqual(ALL_RELAXED);
  });
});
