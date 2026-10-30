/**
 * E2E de **la reprise des promotions** (migration
 * `20261031120000_la_reprise_des_promotions`, plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.4, § 13.11, lot L4), sur le vrai Postgres.
 *
 * Les sources sont posées par les VRAIS gestes — règles par le bus
 * (`CreatePriceRuleCommand`, pause, archivage), sites par la route staff que
 * le back-office appelle. Seuls les états que le domaine refuse aujourd'hui et
 * qu'une ligne ANCIENNE peut porter (remise incomplète ou nulle, famille à
 * contre-sens, « seulement » sans inclusion) sont écrits en SQL : c'est leur
 * sujet.
 *
 * Les fonctions sont REDÉFINIES depuis le fichier de la migration avant les
 * cas : la base de test a pu migrer une version antérieure du fichier, et
 * c'est le fichier qu'on éprouve.
 *
 * Chaque promotion reprise se recharge par le dépôt (`toDomain`, qui revalide
 * par les value objects) : un invariant que le SQL aurait contourné y échoue.
 * Aucune date n'est comparée à l'horloge : les fenêtres sont recopiées.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CreatedPickupResponse } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { ArchivePriceRuleCommand } from "../src/b2b/pricing/application/commands/archive-price-rule.command.js";
import { CreatePriceRuleCommand } from "../src/b2b/pricing/application/commands/create-price-rule.command.js";
import { PausePriceRuleCommand } from "../src/b2b/pricing/application/commands/pause-price-rule.command.js";
import type { PricingRuleDraft } from "../src/b2b/pricing/domain/entities/pricing-rule.js";
import { PromotionRepository } from "../src/b2b/promotions/domain/ports/promotion.repository.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261031120000_la_reprise_des_promotions/migration.sql",
);
const ROLLBACK = join(
  process.cwd(),
  "prisma/rollback/20261031120000_la_reprise_des_promotions.sql",
);

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;
let bus: CommandBus;
let promotions: PromotionRepository;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
  bus = ctx.app.get(CommandBus);
  promotions = ctx.app.get(PromotionRepository);
  for (const definition of functionDefinitions()) {
    await ctx.prisma.$executeRawUnsafe(definition);
  }
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Les `CREATE OR REPLACE FUNCTION … $$;` du fichier — lus, jamais recopiés. */
function functionDefinitions(): readonly string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const definitions = sql.match(/^CREATE OR REPLACE FUNCTION[\s\S]*?^\$\$;/gmu) ?? [];
  if (definitions.length !== 3) {
    throw new Error(
      `Trois fonctions attendues dans la migration, ${String(definitions.length)} trouvées.`,
    );
  }
  return definitions;
}

/** L'ordre d'archivage du retour arrière — lu dans le fichier. */
function rollbackStatement(): string {
  const statement = readFileSync(ROLLBACK, "utf8").match(/^UPDATE public\.promotions[^;]*;/mu);
  if (statement === null) {
    throw new Error("L'ordre d'archivage du retour arrière est introuvable.");
  }
  return statement[0];
}

/**
 * La reprise, puis la cible de chaque promotion reprise : depuis L8b, le
 * public se lit dans `promotion_audience_targets`, que la reprise (L4)
 * n'écrit pas — la bascule l'enchaîne de même (`20261031140000`).
 */
async function reprise(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(`SELECT public.reprise_des_promotions()`);
  await ctx.prisma.$executeRawUnsafe(`SELECT public.cibles_des_promotions_reprises()`);
}

const FROM = new Date(daysAgo(10));

function draft(over: Partial<PricingRuleDraft> = {}): PricingRuleDraft {
  return {
    stage: "promotion",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    effect: { nature: "alter", alteration: { direction: "decrease", mode: "percent", bp: 1_000 } },
    label: "Automne",
    validFrom: FROM,
    validTo: null,
    stacksOverMercuriale: false,
    ...over,
  };
}

function poseRule(over: Partial<PricingRuleDraft> = {}): Promise<string> {
  return bus.execute<CreatePriceRuleCommand, string>(
    new CreatePriceRuleCommand(draft(over), E2E_STAFF_ID),
  );
}

async function croissant(): Promise<{ sku: string; productId: string; categoryId: string }> {
  return ctx.prisma.catalogItem.findFirstOrThrow({
    where: { productSku: "VIE-001", isDefault: true },
    select: { sku: true, productId: true, categoryId: true },
  });
}

/** Un site, ses deux remises posées par la route staff. */
async function poseSite(label: string, discounts: unknown): Promise<string> {
  const response = await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/pickup-addresses")
    .send({
      label,
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      discounts,
    })
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

/** Le corpus : cinq règles d'étage promotion, deux sites remisés, trois sources écartées. */
async function seedCorpus(): Promise<{ readonly rules: readonly string[]; readonly site: string }> {
  const item = await croissant();
  const company = await createCompany(ctx.prisma);
  const global = await poseRule();
  const family = await poseRule({
    label: "Famille",
    scope: { type: "category", id: item.categoryId },
    audience: { type: "company", id: company.id },
    effect: {
      nature: "alter",
      alteration: { direction: "decrease", mode: "amount", millicents: 5_000 },
    },
    minQuantity: 6,
  });
  const product = await poseRule({
    label: "Croissant posé",
    scope: { type: "product", id: item.sku },
    effect: { nature: "replace", amountMillicents: 90_000 },
  });
  const paused = await poseRule({
    label: "En pause",
    audience: { type: "company", id: company.id },
  });
  await bus.execute(new PausePriceRuleCommand(paused, E2E_STAFF_ID, "rupture"));
  const archived = await poseRule({ label: "Rangée", scope: { type: "variant", id: item.sku } });
  // Sans motif : une règle s'archive ainsi, une promotion non.
  await bus.execute(new ArchivePriceRuleCommand(archived, E2E_STAFF_ID, null));

  const site = await poseSite("Cœur de station", {
    b2b: {
      adjustment: { mode: "percent", bp: 1_000 },
      scope: "all_except",
      categories: [{ categoryId: "c_boissons", eligible: false }],
      products: [{ productId: item.productId, eligible: true }],
    },
    b2c: {
      adjustment: { mode: "amount", cents: 300 },
      scope: "only",
      categories: [{ categoryId: item.categoryId, eligible: true }],
      products: [],
    },
  });
  const archivedSite = await poseSite("Fermé", {
    b2b: {
      adjustment: { mode: "percent", bp: 500 },
      scope: "all_except",
      categories: [],
      products: [],
    },
    b2c: null,
  });
  await ctx.asSub(E2E_STAFF_SUB).delete(`/admin/pickup-addresses/${archivedSite}`).expect(204);
  const legacy = await poseSite("Ancien", { b2b: null, b2c: null });
  // Deux états que seule une ligne ancienne porte : un mode sans valeur, une valeur nulle.
  await ctx.prisma.$executeRawUnsafe(
    `UPDATE public.pickup_addresses
        SET discount_mode = 'percent', discount_value = NULL,
            b2c_discount_mode = 'amount', b2c_discount_value = 0
      WHERE id = $1`,
    legacy,
  );
  return { rules: [global, family, product, paused, archived], site };
}

function repriseRows() {
  return ctx.prisma.promotion.findMany({
    where: { legacySource: { not: null } },
    include: { scopeRules: { orderBy: { id: "asc" } } },
    orderBy: { id: "asc" },
  });
}

function repriseActs() {
  return ctx.prisma.pricingEvent.findMany({
    where: { subjectType: "promotion" },
    orderBy: { id: "asc" },
  });
}

describe("la reprise des promotions", () => {
  it("crée une promotion par règle d'étage promotion et par remise servie, rien de plus", async () => {
    const { rules, site } = await seedCorpus();

    await reprise();

    const rows = await repriseRows();
    expect(rows.map((row) => row.legacySource).sort()).toEqual(
      [
        ...rules.map((id) => `price_rule:${id}`),
        `pickup_discount:${site}:b2b`,
        `pickup_discount:${site}:b2c`,
      ].sort(),
    );
    // Les ids des règles sont gardés : la trace figée d'une ligne garde son `ruleId`.
    expect(
      rows
        .filter((row) => row.legacySource?.startsWith("price_rule:"))
        .map((row) => row.id)
        .sort(),
    ).toEqual([...rules].sort());
  });

  it("la source du calcul vaut legacy, et ne connaît que legacy, shadow et promotions", async () => {
    // Posée par la migration, ressemée par le harnais après chaque `reset()`.
    const setting = await ctx.prisma.promotionSetting.findUniqueOrThrow({
      where: { key: "promotions_source" },
    });
    expect(setting.value).toBe("legacy");

    await expect(
      ctx.prisma.promotionSetting.update({
        where: { key: "promotions_source" },
        data: { value: "env" },
      }),
    ).rejects.toThrow("promotion_settings_source_known");
  });

  it("recharge CHAQUE promotion reprise par le dépôt, qui revalide ses invariants", async () => {
    await seedCorpus();
    await reprise();

    for (const row of await repriseRows()) {
      const loaded = await promotions.load(row.id);
      expect(loaded?.id).toBe(row.id);
    }
  });

  it("recopie les termes : effet, public, portée, condition, pause et archivage", async () => {
    const { rules, site } = await seedCorpus();
    const [global, family, product, paused, archived] = rules;
    const item = await croissant();
    await reprise();

    const byId = new Map((await repriseRows()).map((row) => [row.id, row]));
    expect(byId.get(global ?? "")).toMatchObject({
      applicationPoint: "line",
      effectKind: "percent_off",
      effectValue: 1_000,
      audienceKind: "everyone",
      fulfillmentKind: "any",
      scopeMode: "all_except",
      scopeRules: [],
      validFrom: FROM,
    });
    expect(byId.get(family ?? "")).toMatchObject({
      effectKind: "unit_amount_off",
      effectValue: 5_000,
      audienceKind: "company",
      scopeMode: "only",
      conditions: [{ kind: "min_quantity", value: 6 }],
      scopeRules: [
        expect.objectContaining({
          target: "category",
          targetId: item.categoryId,
          eligible: true,
          targetRank: null,
        }),
      ],
    });
    expect(byId.get(product ?? "")).toMatchObject({
      effectKind: "fixed_unit_price",
      effectValue: 90_000,
      scopeRules: [
        expect.objectContaining({ target: "variant", targetId: item.sku, targetRank: 2 }),
      ],
    });
    expect(byId.get(paused ?? "")?.pausedBy).toBe(E2E_STAFF_ID);
    expect(byId.get(archived ?? "")).toMatchObject({
      archivedBy: E2E_STAFF_ID,
      archiveReason: "archivée sans motif, avant la reprise",
      scopeRules: [expect.objectContaining({ target: "variant", targetRank: null })],
    });
    expect(byId.get(`pd_${site}_b2b`)).toMatchObject({
      applicationPoint: "basket",
      effectKind: "percent_off",
      audienceKind: "pros_active",
      fulfillmentKind: "pickup_point",
      fulfillmentPickupId: site,
      scopeMode: "all_except",
      createdBy: "system:reprise-promotions",
    });
    expect(byId.get(`pd_${site}_b2c`)).toMatchObject({
      effectKind: "basket_amount_off",
      effectValue: 300,
      audienceKind: "everyone_but_active_pros",
      scopeMode: "only",
      scopeRules: [expect.objectContaining({ target: "category", eligible: true })],
    });
  });

  it("journalise un `posed` par promotion créée, plus `archived` pour l'archivée", async () => {
    await seedCorpus();
    await reprise();

    const acts = await repriseActs();
    expect(acts.filter((act) => act.act === "posed")).toHaveLength(7);
    expect(acts.filter((act) => act.act === "archived")).toHaveLength(1);
    expect(new Set(acts.map((act) => act.actor))).toEqual(new Set(["system:reprise-promotions"]));
    expect(
      acts.find((act) =>
        act.summary.startsWith("−10 % · tout le monde · tous acheminements · du "),
      ),
    ).toBeDefined();
  });

  it("rejouée, ne change rien et n'écrit aucun acte", async () => {
    await seedCorpus();
    await reprise();
    const rows = await repriseRows();
    const acts = await repriseActs();

    await reprise();

    expect(await repriseRows()).toEqual(rows);
    expect(await repriseActs()).toEqual(acts);
  });

  it("rejouée après le retour arrière, DÉSARCHIVE ce que la source garde vivant", async () => {
    const { rules } = await seedCorpus();
    await reprise();
    await ctx.prisma.$executeRawUnsafe(rollbackStatement());
    expect((await repriseRows()).every((row) => row.archivedAt !== null)).toBe(true);

    await reprise();

    const archived = (await repriseRows())
      .filter((row) => row.archivedAt !== null)
      .map((row) => row.id);
    expect(archived).toEqual([rules[4]]);
  });

  it("ne touche jamais une promotion saisie", async () => {
    await reprise();
    expect(await ctx.prisma.promotion.count()).toBe(0);
  });
});

describe("le rejeu rattrape la dérive des sources (aucun éditeur gelé avant L8)", () => {
  it("archive la promotion d'un site archivé depuis, et l'écrit au journal", async () => {
    const { site } = await seedCorpus();
    await reprise();

    await ctx.asSub(E2E_STAFF_SUB).delete(`/admin/pickup-addresses/${site}`).expect(204);
    await reprise();

    const rows = await repriseRows();
    for (const clientele of ["b2b", "b2c"]) {
      expect(rows.find((row) => row.id === `pd_${site}_${clientele}`)).toMatchObject({
        archivedBy: "system:reprise-promotions",
        archiveReason: "remise de retrait retirée à la source",
      });
    }
    const archivedActs = (await repriseActs()).filter(
      (act) => act.act === "archived" && act.subjectId.startsWith(`pd_${site}`),
    );
    expect(archivedActs).toHaveLength(2);
  });

  it("archive une remise retirée, mise à zéro ou rendue incomplète, et la rend vivante si elle revient", async () => {
    const { site } = await seedCorpus();
    await reprise();

    await ctx
      .asSub(E2E_STAFF_SUB)
      .patch(`/admin/pickup-addresses/${site}`)
      .send({
        label: "Cœur de station",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "75002",
        ville: "Paris",
        pays: "France",
        discounts: {
          b2b: null,
          b2c: {
            adjustment: { mode: "amount", cents: 0 },
            scope: "all_except",
            categories: [],
            products: [],
          },
        },
      })
      .expect(204);
    await reprise();
    const archived = (await repriseRows()).filter(
      (row) => row.id.startsWith(`pd_${site}`) && row.archivedAt !== null,
    );
    expect(archived.map((row) => row.id).sort()).toEqual([`pd_${site}_b2b`, `pd_${site}_b2c`]);

    await ctx.prisma.$executeRawUnsafe(
      `UPDATE public.pickup_addresses SET discount_mode = 'percent', discount_value = NULL WHERE id = $1`,
      site,
    );
    await reprise();
    expect(
      (await repriseRows()).find((row) => row.id === `pd_${site}_b2b`)?.archivedAt,
    ).not.toBeNull();

    await ctx.prisma.$executeRawUnsafe(
      `UPDATE public.pickup_addresses SET discount_value = 700 WHERE id = $1`,
      site,
    );
    await reprise();
    expect((await repriseRows()).find((row) => row.id === `pd_${site}_b2b`)).toMatchObject({
      archivedAt: null,
      effectValue: 700,
    });
  });

  it("une règle remplacée (archivée puis reposée) donne une promotion archivée et une neuve", async () => {
    const first = await poseRule({ label: "Avant" });
    await reprise();

    await bus.execute(new ArchivePriceRuleCommand(first, E2E_STAFF_ID, "remplacée"));
    const second = await poseRule({ label: "Après", validFrom: new Date(daysAgo(1)) });
    await reprise();

    const rows = await repriseRows();
    expect(rows.find((row) => row.id === first)).toMatchObject({ archiveReason: "remplacée" });
    expect(rows.find((row) => row.id === second)).toMatchObject({
      archivedAt: null,
      internalName: "Après",
    });
    for (const row of rows) {
      expect((await promotions.load(row.id))?.id).toBe(row.id);
    }
    const acts = await repriseActs();
    expect(acts.filter((act) => act.subjectId === second).map((act) => act.act)).toEqual(["posed"]);
    expect(
      acts
        .filter((act) => act.subjectId === first)
        .map((act) => act.act)
        .sort(),
    ).toEqual(["archived", "posed"]);
  });
});

describe("les arrêts nommés", () => {
  it("s'arrête sur une HAUSSE, la nomme, et n'écrit rien", async () => {
    await poseRule();
    const raise = await poseRule({
      label: "Hausse",
      scope: { type: "category", id: (await croissant()).categoryId },
      effect: { nature: "alter", alteration: { direction: "increase", mode: "percent", bp: 500 } },
    });

    await expect(reprise()).rejects.toThrow(raise);
    expect(await ctx.prisma.promotion.count()).toBe(0);
  });

  it("s'arrête sur une hausse ARCHIVÉE aussi : reprise en baisse, elle mentirait", async () => {
    const raise = await poseRule({
      effect: {
        nature: "alter",
        alteration: { direction: "increase", mode: "amount", millicents: 1_000 },
      },
    });
    await bus.execute(new ArchivePriceRuleCommand(raise, E2E_STAFF_ID, "erreur"));

    await expect(reprise()).rejects.toThrow("hausse");
  });

  it("s'arrête sur une famille à contre-sens du mode, et la nomme", async () => {
    const site = await poseSite("Ancien", {
      b2b: {
        adjustment: { mode: "percent", bp: 1_000 },
        scope: "all_except",
        categories: [{ categoryId: "c_pain", eligible: false }],
        products: [],
      },
      b2c: null,
    });
    // Écrite avant le 2026-10-23, quand la réinclusion d'une famille était admise.
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE public.pickup_discount_rules SET eligible = true WHERE site_id = $1`,
      site,
    );

    await expect(reprise()).rejects.toThrow(
      `famille à contre-sens du mode : pd_${site}_b2b (c_pain)`,
    );
    expect(await ctx.prisma.promotion.count()).toBe(0);
  });

  it("s'arrête sur un « seulement » qui n'inclut rien, et le nomme", async () => {
    const site = await poseSite("Ancien", {
      b2b: null,
      b2c: {
        adjustment: { mode: "percent", bp: 1_000 },
        scope: "only",
        categories: [],
        products: [{ productId: "p_x", eligible: true }],
      },
    });
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE public.pickup_discount_rules SET eligible = false WHERE site_id = $1`,
      site,
    );

    await expect(reprise()).rejects.toThrow(`« seulement » sans inclusion : pd_${site}_b2c`);
  });
});
