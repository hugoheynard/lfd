/**
 * E2E des **déclencheurs de la version par journée** —
 * `documentation/caching-usage/plan-version-par-journee.md`, D2, D3, D7.
 *
 * Trois choses que seule la base migrée peut dire :
 *
 * - **D7, la porte** : toute table du schéma `production`, et toute table de
 *   `public` qui porte un jour, a son déclencheur de journal — ou figure dans
 *   la liste écrite ci-dessous, avec sa raison. Une table neuve sans
 *   déclencheur fait échouer cette suite EN SE NOMMANT ;
 * - **D2** : un déclencheur d'instruction écrit une ligne par journée touchée,
 *   pas une par ligne ;
 * - **le balayage** retire les traces de plus de sept jours, et elles seules.
 */
import { bootstrapE2e, daysAgo, serviceDay, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/**
 * **Les tables qui n'ont PAS de déclencheur de journal**, et pourquoi. Ne pas
 * en avoir se justifie (D7) : une entrée sans raison n'a rien à faire ici.
 */
const UNWATCHED: Readonly<Record<string, string>> = {
  "production.day_change": "le journal lui-même",
  "public.day_change": "le journal lui-même",
  "production.order_handover":
    "un retrait change le statut de la commande, donc `public.orders` et son journal ; son jour n'existe que dans une table d'un autre bloc (D3)",
  "production.production_container": "un réglage par SKU, sans journée",
  "production.production_quality_upload":
    "un dépôt de photo en attente, sans journée — il n'y entre qu'en devenant une photo, surveillée",
};

/** Les colonnes qui disent « cette ligne appartient à une journée », côté `public`. */
const DAY_COLUMNS = ["requested_delivery_date", "service_day"];

/** Les trois événements qu'une table surveillée doit déclencher. */
const EVENTS = ["INSERT", "UPDATE", "DELETE"] as const;

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

/** `schéma.table` → les événements pour lesquels elle écrit dans le journal de SON schéma. */
async function journalTriggers(): Promise<Map<string, Set<string>>> {
  const rows = await ctx.prisma.$queryRaw<{ tbl: string; event: string }[]>`
    SELECT n.nspname || '.' || c.relname AS tbl, e.event_manipulation AS event
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace pn ON pn.oid = p.pronamespace
      JOIN information_schema.triggers e
        ON e.trigger_name = t.tgname
       AND e.event_object_schema = n.nspname
       AND e.event_object_table = c.relname
     WHERE NOT t.tgisinternal
       AND pn.nspname = n.nspname
       AND e.action_orientation = 'STATEMENT'
       AND p.prosrc LIKE '%day_change%'`;
  const found = new Map<string, Set<string>>();
  for (const { tbl, event } of rows) {
    found.set(tbl, (found.get(tbl) ?? new Set()).add(event));
  }
  return found;
}

async function tablesToWatch(): Promise<string[]> {
  const rows = await ctx.prisma.$queryRaw<{ tbl: string }[]>`
    SELECT table_schema || '.' || table_name AS tbl
      FROM information_schema.tables
     WHERE table_type = 'BASE TABLE' AND table_schema = 'production'
    UNION
    SELECT table_schema || '.' || table_name
      FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = ANY(${DAY_COLUMNS})`;
  return rows.map((row) => row.tbl).sort();
}

describe("D7 — une table qui porte une journée a son déclencheur, ou sa raison écrite", () => {
  it("aucune table à surveiller n'en manque", async () => {
    const triggers = await journalTriggers();
    const missing = (await tablesToWatch())
      .filter((tbl) => !(tbl in UNWATCHED))
      .flatMap((tbl) =>
        EVENTS.filter((event) => !triggers.get(tbl)?.has(event)).map(
          (event) => `${tbl} (${event})`,
        ),
      );
    // Le message NOMME la table : c'est lui qu'on lira dans la CI.
    expect(missing).toEqual([]);
  });

  it("la liste des exceptions ne ment pas : chacune existe, et aucune n'est en fait surveillée", async () => {
    const tables = await tablesToWatch();
    const triggers = await journalTriggers();
    for (const tbl of Object.keys(UNWATCHED)) {
      expect({ tbl, exists: tables.includes(tbl) }).toEqual({ tbl, exists: true });
      expect({ tbl, watched: triggers.has(tbl) }).toEqual({ tbl, watched: false });
    }
  });

  it("aucun déclencheur de journal n'écrit hors de son schéma (D3)", async () => {
    const rows = await ctx.prisma.$queryRaw<{ fn: string; src: string }[]>`
      SELECT pn.nspname || '.' || p.proname AS fn, p.prosrc AS src
        FROM pg_proc p JOIN pg_namespace pn ON pn.oid = p.pronamespace
       WHERE p.prosrc LIKE '%day_change%' AND pn.nspname IN ('public', 'production')`;
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const { fn, src } of rows) {
      const own = fn.split(".")[0];
      const foreign = own === "public" ? '"production".' : '"public".';
      expect({ fn, crosses: src.includes(foreign) }).toEqual({ fn, crosses: false });
    }
  });
});

describe("D2 — une ligne par journée et par instruction", () => {
  const DAY = serviceDay();
  const OTHER_DAY = serviceDay(8);
  const traces = (day: string) =>
    ctx.prisma.productionDayChange.count({ where: { serviceDay: day } });

  it("une instruction qui touche trois lignes du même jour n'écrit qu'une trace", async () => {
    await ctx.prisma.productionDay.create({ data: { serviceDay: DAY } });
    const before = await traces(DAY);
    await ctx.prisma.productionCount.createMany({
      data: ["A-1", "A-2", "A-3"].map((sku) => ({
        serviceDay: DAY,
        sku,
        productName: sku,
        quantity: 1,
      })),
    });
    expect((await traces(DAY)) - before).toBe(1);
  });

  it("une instruction sur deux journées écrit une trace pour chacune", async () => {
    await ctx.prisma.productionDay.createMany({
      data: [{ serviceDay: DAY }, { serviceDay: OTHER_DAY }],
    });
    const [day, other] = [await traces(DAY), await traces(OTHER_DAY)];
    await ctx.prisma.productionDay.updateMany({ data: { retakenBy: "fiche-test" } });
    expect((await traces(DAY)) - day).toBe(1);
    expect((await traces(OTHER_DAY)) - other).toBe(1);
  });

  it("une instruction qui ne touche aucune ligne n'écrit rien", async () => {
    const before = await ctx.prisma.productionDayChange.count();
    await ctx.prisma.productionDay.updateMany({
      where: { serviceDay: DAY },
      data: { retakenBy: "personne" },
    });
    expect(await ctx.prisma.productionDayChange.count()).toBe(before);
  });
});

describe("le balayage des journaux", () => {
  const OLD = daysAgo(8);
  const RECENT = daysAgo(6);

  async function seedTraces(): Promise<void> {
    await ctx.prisma.orderDayChange.createMany({
      data: [
        { serviceDay: "old", changedAt: new Date(OLD) },
        { serviceDay: "recent", changedAt: new Date(RECENT) },
      ],
    });
    await ctx.prisma.productionDayChange.createMany({
      data: [
        { serviceDay: "old", changedAt: new Date(OLD) },
        { serviceDay: "recent", changedAt: new Date(RECENT) },
      ],
    });
  }

  it("le passage nocturne du fournil retire les traces du fournil de plus de sept jours", async () => {
    await seedTraces();
    await ctx
      .http()
      .post("/admin/production/quality/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    const left = await ctx.prisma.productionDayChange.findMany({ select: { serviceDay: true } });
    expect(left).toEqual([{ serviceDay: "recent" }]);
    // Le journal du commerce n'est pas le sien.
    expect(await ctx.prisma.orderDayChange.count()).toBe(2);
  });

  it("la passe horaire du commerce retire les traces du commerce de plus de sept jours", async () => {
    await seedTraces();
    await ctx
      .http()
      .post("/admin/orders/settlement-reminders")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    const left = await ctx.prisma.orderDayChange.findMany({ select: { serviceDay: true } });
    expect(left).toEqual([{ serviceDay: "recent" }]);
    expect(await ctx.prisma.productionDayChange.count()).toBe(2);
  });
});
