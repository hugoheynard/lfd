/**
 * E2E des **versions par contexte** —
 * `documentation/caching-usage/plan-materiaux-du-catalogue.md`, § 2.2, § 11
 * (lot M1a).
 *
 * Ce que seule la base migrée peut dire : les huit déclencheurs existent,
 * chacun appelle la fonction de SON contexte, et une écriture dans un contexte
 * ne fait monter QUE sa ligne de `context_versions` — sur une colonne que
 * l'instantané lira (en particulier TOUT ce qui fait apparaître ou disparaître
 * un article), sur `INSERT` et `DELETE`, sous une écriture SQL à la main
 * aussi ; jamais sur une colonne ignorée. Rien ne lit encore ces numéros (M1b).
 */
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

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

type Context = "catalog" | "operations" | "order_cutoffs";
type Versions = Readonly<Record<Context, bigint>>;

/** Les trois numéros, en une lecture. */
async function versions(): Promise<Versions> {
  const rows = await ctx.prisma.contextVersion.findMany();
  const of = (context: Context): bigint =>
    rows.find((row) => row.context === context)?.value ?? -1n;
  return {
    catalog: of("catalog"),
    operations: of("operations"),
    order_cutoffs: of("order_cutoffs"),
  };
}

/** Un article du catalogue semé par le harnais. */
async function anySku(): Promise<string> {
  const item = await ctx.prisma.catalogItem.findFirstOrThrow({ select: { sku: true } });
  return item.sku;
}

/** Le numéro de `context` monte d'exactement un sous `write`, et les deux autres ne bougent pas. */
async function expectBumpOf(context: Context, write: () => Promise<unknown>): Promise<void> {
  const before = await versions();
  await write();
  expect(await versions()).toEqual({ ...before, [context]: before[context] + 1n });
}

/** Aucun des trois numéros ne bouge sous `write`. */
async function expectNoBump(write: () => Promise<unknown>): Promise<void> {
  const before = await versions();
  await write();
  expect(await versions()).toEqual(before);
}

const expectBump = (write: () => Promise<unknown>): Promise<void> => expectBumpOf("catalog", write);

describe("les versions par contexte — les déclencheurs", () => {
  it("chacune des huit tables porte son déclencheur BEFORE, par instruction, vers la fonction de son contexte", async () => {
    const rows = await ctx.prisma.$queryRaw<
      { table: string; fn: string; tgtype: number; tgenabled: string }[]
    >`
      SELECT c.relname AS "table", p.proname::text AS fn, t.tgtype::int AS tgtype,
             t.tgenabled::text AS tgenabled
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE n.nspname = 'public' AND p.proname IN ('catalog_version_bump', 'operations_version_bump', 'order_cutoffs_version_bump')
         AND NOT t.tgisinternal
       ORDER BY c.relname`;
    // tgtype : 1 = par ligne, 2 = BEFORE, 4 = INSERT, 8 = DELETE, 16 = UPDATE.
    expect(rows.map((row) => [row.table, row.fn])).toEqual([
      ["catalog_categories", "catalog_version_bump"],
      ["catalog_item_overrides", "catalog_version_bump"],
      ["catalog_item_reservations", "catalog_version_bump"],
      ["catalog_items", "catalog_version_bump"],
      ["catalog_operation_items", "operations_version_bump"],
      ["catalog_operations", "operations_version_bump"],
      ["order_cutoff_settings", "order_cutoffs_version_bump"],
      ["order_cutoffs", "order_cutoffs_version_bump"],
    ]);
    for (const row of rows) {
      expect(row.tgtype & 1).toBe(0);
      expect(row.tgtype & (2 | 4 | 8 | 16)).toBe(2 | 4 | 8 | 16);
      expect(row.tgenabled).toBe("O");
    }
  });

  it("le harnais remet les trois lignes : deux remises successives rendent les mêmes numéros", async () => {
    const first = await versions();
    await ctx.prisma.$executeRaw`UPDATE "public"."catalog_items" SET "name" = "name"`;
    await ctx.prisma.$executeRaw`UPDATE "public"."catalog_operations" SET "hidden" = "hidden"`;
    await ctx.prisma.$executeRaw`UPDATE "public"."order_cutoffs" SET "time" = "time"`;
    await ctx.reset();
    expect(await versions()).toEqual(first);
  });

  it("le harnais recrée une ligne effacée par un test", async () => {
    await ctx.prisma.$executeRaw`DELETE FROM "public"."context_versions"`;
    await ctx.reset();
    expect((await versions()).operations).toBe(0n);
  });

  it("une ligne effacée à la main est recréée par la première écriture de son contexte", async () => {
    await ctx.prisma.$executeRaw`DELETE FROM "public"."context_versions"`;
    await ctx.prisma.$executeRaw`UPDATE "public"."catalog_items" SET "name" = "name"`;
    expect(await versions()).toEqual({ catalog: 1n, operations: -1n, order_cutoffs: -1n });
  });

  it("refuse un contexte inconnu", async () => {
    await expect(
      ctx.prisma
        .$executeRaw`INSERT INTO "public"."context_versions" ("context") VALUES ('pricing')`,
    ).rejects.toThrow(/context_versions_known_context/u);
  });
});

/** Une écriture dans un contexte ne fait monter QUE sa ligne (plan, § 11). */
describe("les versions par contexte — chacun la sienne", () => {
  it("masquer une opération fait monter operations seule", async () => {
    await expectBumpOf(
      "operations",
      () => ctx.prisma.$executeRaw`UPDATE "public"."catalog_operations" SET "hidden" = true`,
    );
  });

  it("changer la sélection d'une opération fait monter operations seule", async () => {
    await expectBumpOf(
      "operations",
      () => ctx.prisma.$executeRaw`DELETE FROM "public"."catalog_operation_items"`,
    );
  });

  it("une heure limite changée fait monter order_cutoffs seule", async () => {
    await expectBumpOf(
      "order_cutoffs",
      () => ctx.prisma.$executeRaw`UPDATE "public"."order_cutoffs" SET "time" = "time"`,
    );
  });

  it("ouvrir le jour même aux pros fait monter order_cutoffs seule", async () => {
    await expectBumpOf(
      "order_cutoffs",
      () =>
        ctx.prisma
          .$executeRaw`UPDATE "public"."order_cutoff_settings" SET "same_day_pro_allowed" = true`,
    );
  });

  it("masquer un article fait monter catalog seule", async () => {
    await expectBumpOf(
      "catalog",
      () => ctx.prisma.$executeRaw`UPDATE "public"."catalog_item_overrides" SET "is_hidden" = true`,
    );
  });
});

/** Tout ce qui fait apparaître ou disparaître un article d'un lecteur (plan, § 2.2). */
describe("les versions par contexte — ce qui fait disparaître un article", () => {
  it("masquer un article (is_hidden = true) fait monter catalog", async () => {
    const sku = await anySku();
    await ctx.prisma.catalogItemOverride.create({ data: { sku } });
    await expectBump(() =>
      ctx.prisma.catalogItemOverride.update({ where: { sku }, data: { isHidden: true } }),
    );
  });

  it.each([
    ["is_hidden_public", { isHiddenPublic: true }],
    ["reserved_visibility", { reservedVisibility: "visible_locked" }],
    ["is_featured_pro", { isFeaturedPro: true }],
  ] as const)("une dérogation sur %s la fait monter", async (_column, data) => {
    const sku = await anySku();
    await ctx.prisma.catalogItemOverride.create({ data: { sku } });
    await expectBump(() => ctx.prisma.catalogItemOverride.update({ where: { sku }, data }));
  });

  it.each([
    ["withdrawn_at (retrait)", `UPDATE "public"."catalog_items" SET "withdrawn_at" = now()`],
    ["audience", `UPDATE "public"."catalog_items" SET "audience" = 'pro'`],
    ["public_review_pending", `UPDATE "public"."catalog_items" SET "public_review_pending" = true`],
    ["pro_review_pending", `UPDATE "public"."catalog_items" SET "pro_review_pending" = true`],
    ["custom_recipe (sur mesure)", `UPDATE "public"."catalog_items" SET "custom_recipe" = true`],
    [
      "vat_rate_percent (sans taux, invendable)",
      `UPDATE "public"."catalog_items" SET "vat_rate_percent" = NULL`,
    ],
    [
      "price_millicents (prix pro servi)",
      `UPDATE "public"."catalog_items" SET "price_millicents" = NULL`,
    ],
    [
      "public_by_context (prix public servi)",
      `UPDATE "public"."catalog_items" SET "public_by_context" = NULL`,
    ],
    [
      "is_default / variants_as_tiles",
      `UPDATE "public"."catalog_items" SET "variants_as_tiles" = false`,
    ],
    ["operation_only", `UPDATE "public"."catalog_items" SET "operation_only" = true`],
  ])("une écriture SQL à la main sur %s la fait monter", async (_column, sql) => {
    await expectBump(() => ctx.prisma.$executeRawUnsafe(sql));
  });

  it("poser puis lever une réservation la font monter (INSERT, DELETE)", async () => {
    const sku = await anySku();
    await expectBump(() =>
      ctx.prisma.catalogItemReservation.create({
        data: { sku, companyId: "co_stamp", reservedAt: new Date(0), reservedBy: "e2e" },
      }),
    );
    await expectBump(() => ctx.prisma.catalogItemReservation.deleteMany({ where: { sku } }));
  });
});

describe("les versions par contexte — les colonnes ignorées", () => {
  it("la trace du geste des visuels (visuals_gesture_id) ne la fait pas monter", async () => {
    await expectNoBump(
      () =>
        ctx.prisma
          .$executeRaw`UPDATE "public"."catalog_items" SET "visuals_gesture_id" = 'g_stamp'`,
    );
  });

  it("le froid (requires_cold), lu par la livraison seule, ne la fait pas monter", async () => {
    await expectNoBump(
      () => ctx.prisma.$executeRaw`UPDATE "public"."catalog_items" SET "requires_cold" = true`,
    );
  });

  it("une écriture de dérogation qui ne touche que decided_by ne la fait pas monter", async () => {
    const sku = await anySku();
    await ctx.prisma.catalogItemOverride.create({ data: { sku } });
    await expectNoBump(
      () => ctx.prisma.$executeRaw`
        UPDATE "public"."catalog_item_overrides" SET "decided_by" = 'staff' WHERE "sku" = ${sku}`,
    );
  });

  it.each([
    [
      "l'auteur et l'instant",
      `UPDATE "public"."order_cutoff_settings" SET "updated_at" = now(), "updated_by_name" = 'x'`,
    ],
    ["la garde en rayon", `UPDATE "public"."order_cutoff_settings" SET "shelf_hold_minutes" = 31`],
    [
      "le rappel et l'alerte de retard",
      `UPDATE "public"."order_cutoff_settings" SET "pickup_reminder_delay_minutes" = 5, "delay_warning_delay_minutes" = 5`,
    ],
    [
      "l'heure du réassort",
      `UPDATE "public"."order_cutoff_settings" SET "resupply_cutoff_time" = '19:00'`,
    ],
    ["la trace d'une opération", `UPDATE "public"."catalog_operations" SET "written_by" = 'staff'`],
  ])("un réglage que le devis ne juge pas (%s) ne fait rien monter", async (_what, sql) => {
    await expectNoBump(() => ctx.prisma.$executeRawUnsafe(sql));
  });
});

describe("les versions par contexte — les autres tables du catalogue", () => {
  it("une famille renommée fait monter catalog", async () => {
    await expectBump(
      () => ctx.prisma.$executeRaw`UPDATE "public"."catalog_categories" SET "name" = "name"`,
    );
  });

  it("le circuit sans crédit au compte fait monter order_cutoffs", async () => {
    await expectBumpOf(
      "order_cutoffs",
      () =>
        ctx.prisma
          .$executeRaw`UPDATE "public"."order_cutoff_settings" SET "same_day_pro_without_credit" = 'refuse'`,
    );
  });
});
