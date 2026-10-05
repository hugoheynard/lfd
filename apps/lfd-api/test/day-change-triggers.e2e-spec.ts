/**
 * E2E des **déclencheurs de la version par journée** —
 * `documentation/caching-usage/plan-version-par-journee.md`, D2, D3, D7.
 *
 * Trois choses que seule la base migrée peut dire :
 *
 * - **D7, la porte** : toute table des schémas `production` et `delivery`, et
 *   toute table de `public` qui porte un jour, a son déclencheur de journal —
 *   ou figure dans la liste écrite ci-dessous, avec sa raison. Une table neuve
 *   sans déclencheur fait échouer cette suite EN SE NOMMANT ;
 * - **D3, le cloisonnement** : un déclencheur de journal n'écrit que dans le
 *   journal du schéma de SA table (`plan-schema-delivery.md`, SD-D5) ;
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
  "delivery.day_change": "le journal lui-même",
  "packing.day_change": "le journal lui-même",
  "production.order_handover":
    "un retrait change le statut de la commande, donc `public.orders` et son journal ; son jour n'existe que dans une table d'un autre bloc (D3)",
  "production.order_departure":
    "la garde passée au livreur (BQ, 2026-10-01) : le départ fait déjà bouger la journée de la livraison, et son jour n'existe que dans une table d'un autre bloc (D3), comme `order_handover`",
  "production.order_handover_proof":
    "les pièces d'une remise à la porte (B1, 2026-10-01) : la remise clôt l'arrêt, qui fait déjà bouger la journée de la livraison ; son jour n'existe que dans une table d'un autre bloc (D3), comme `order_handover`",
  "production.production_container": "un réglage par SKU, sans journée",
  "production.production_quality_upload":
    "un dépôt de photo en attente, sans journée — il n'y entre qu'en devenant une photo, surveillée",
  // Les bases de la livraison (lot 2, 2026-09-29) n'appartiennent à aucune
  // journée. Elles vivent dans le schéma `delivery` depuis le 2026-09-30
  // (`plan-schema-delivery.md`, SD-D5) : les exceptions l'ont suivi, elles ne
  // se sont pas effacées. ⚠️ La TOURNÉE (lot 3) en portera une : elle aura
  // son déclencheur, et n'entrera pas dans cette liste.
  "delivery.delivery_vehicle":
    "la flotte, un réglage sans journée — une tournée qui recopie le véhicule, elle, en portera une",
  "delivery.delivery_departure": "le point de départ des tournées, un réglage unique sans journée",
  // Le bac (lot 4, L4-C18) n'est PLUS une exception depuis le 2026-10-01
  // (`parcours-du-livreur.md`, PL4) : sa déclaration fait bouger le journal
  // par la journée des arrêts de sa commande (`record_day_change_by_bin_order`).
  // Le calculateur de tournée (lot 7, 2026-09-29) : un réglage, et un cache
  // d'adresses. Ce qu'il ÉCRIT dans une journée passe par la tournée, qui a
  // ses déclencheurs.
  "delivery.delivery_routing_settings":
    "les réglages du calcul de tournée, un réglage unique sans journée",
  // La décision réglée d'avance à la porte (B3 bis, 2026-10-01) : un réglage.
  // Ce qu'il fait d'un arrêt est figé au départ dans `delivery_stop_execution`,
  // surveillée.
  "delivery.delivery_doorstep_settings":
    "le réglage global de la décision d'avance à la porte, un réglage unique sans journée",
  "delivery.delivery_geocode":
    "le cache du géocodage, clé d'une adresse et non d'un jour — une proposition appliquée s'écrit dans `delivery_round`, surveillée",
  // Le simulateur (lot 9, L9-C7, 2026-09-29) : des arrêts INVENTÉS, sans
  // client ni commande. « Partir d'une journée » COPIE un jour, il n'y écrit rien.
  "delivery.delivery_simulation_scenario":
    "les scénarios du simulateur, des essais sans client ni journée — rien de ce qu'ils portent n'entre dans une tournée",
  // Les bacs (lot 4 bis, tranche A, 2026-09-29) : un catalogue et une grille
  // de réglage. Ce qui portera un jour — le bac déclaré, son chargement — vit
  // ailleurs et aura ses déclencheurs.
  "delivery.delivery_bin_type": "le catalogue des types de bacs, un réglage sans journée",
  "delivery.delivery_bin_capacity":
    "la grille des contenances bacs × produits, un réglage sans journée",
  // La bibliothèque d'achat (lot B1, 2026-09-30) : des véhicules et des bacs
  // qu'on n'a PAS achetés, dans leurs propres tables — aucune tournée ne les lit.
  "delivery.delivery_purchase_vehicle_candidate":
    "les véhicules candidats de la bibliothèque d'achat, sans journée ni tournée",
  "delivery.delivery_purchase_bin_candidate":
    "les formats de bacs candidats de la bibliothèque d'achat, sans journée ni colisage",
  // Les scénarios d'achat (lot B3, 2026-10-01) : une sélection de candidats
  // et de réels pour le tableau croisé — aucune journée, aucune tournée.
  "delivery.delivery_purchase_scenario":
    "les scénarios de la bibliothèque d'achat, des sélections nommées sans journée ni tournée",
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
     WHERE table_type = 'BASE TABLE' AND table_schema IN ('production', 'delivery', 'packing')
    UNION
    SELECT table_schema || '.' || table_name
      FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = ANY(${DAY_COLUMNS})`;
  return rows.map((row) => row.tbl).sort();
}

/** Un déclencheur de journal : le schéma de sa table, de sa fonction, et ceux que son corps cite. */
interface JournalTriggerSchemas {
  readonly trigger: string;
  readonly table_schema: string;
  readonly function_schema: string;
  readonly body: string;
}

type RawReader = Pick<E2eContext["prisma"], "$queryRaw">;

/** Lu dans `pg_trigger` : l'état réel de la base, pas l'historique des migrations. */
function journalTriggerSchemas(db: RawReader): Promise<JournalTriggerSchemas[]> {
  return db.$queryRaw<JournalTriggerSchemas[]>`
    SELECT n.nspname || '.' || t.tgname AS trigger, n.nspname AS table_schema,
           pn.nspname AS function_schema, p.prosrc AS body
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace pn ON pn.oid = p.pronamespace
     WHERE NOT t.tgisinternal AND p.prosrc LIKE '%day_change%'`;
}

/** Les schémas qu'un corps de fonction nomme — `"schéma"."table"`. */
function citedSchemas(body: string): string[] {
  return [...new Set([...body.matchAll(/"([a-z_]+)"\."/gu)].map((match) => match[1]!))].sort();
}

/**
 * Les déclencheurs qui traversent : schéma de la table = schéma de la fonction
 * = SEUL schéma cité dans le corps, sinon il est nommé.
 */
function crossingTriggers(rows: readonly JournalTriggerSchemas[]): string[] {
  return rows
    .filter(
      (row) =>
        row.table_schema !== row.function_schema ||
        citedSchemas(row.body).join() !== row.function_schema,
    )
    .map((row) => row.trigger)
    .sort();
}

class RolledBack extends Error {
  constructor(readonly value: string[]) {
    super("annulée volontairement");
  }
}

/** Exécute dans une transaction, puis l'annule : la base ne garde rien de l'essai. */
async function withRolledBack(
  run: (tx: RawReader & Pick<E2eContext["prisma"], "$executeRawUnsafe">) => Promise<string[]>,
): Promise<string[]> {
  try {
    await ctx.prisma.$transaction(async (tx) => {
      throw new RolledBack(await run(tx));
    });
  } catch (error) {
    if (error instanceof RolledBack) {
      return error.value;
    }
    throw error;
  }
  return [];
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

  it("aucun déclencheur de journal n'écrit hors du schéma de sa table (D3)", async () => {
    const triggers = await journalTriggerSchemas(ctx.prisma);
    // Les quatre journaux ont chacun leurs déclencheurs (`packing` depuis la
    // bascule du colisage, K2) : une requête qui ne trouverait plus rien
    // passerait sans rien garder.
    expect(new Set(triggers.map((row) => row.table_schema))).toEqual(
      new Set(["public", "production", "delivery", "packing"]),
    );
    expect(crossingTriggers(triggers)).toEqual([]);
  });

  /**
   * La garde elle-même, éprouvée : la faute qu'elle a laissée passer jusqu'au
   * 2026-09-30 — une table de livraison branchée sur la fonction du fournil —
   * doit la faire échouer. Posée dans une transaction annulée.
   */
  it("une table de livraison rebranchée sur la fonction du fournil est dénoncée", async () => {
    const found = await withRolledBack(async (tx) => {
      await tx.$executeRawUnsafe(`
        CREATE TRIGGER "delivery_round_crossing_probe"
          AFTER INSERT ON "delivery"."delivery_round"
          REFERENCING NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"()`);
      return crossingTriggers(await journalTriggerSchemas(tx));
    });
    expect(found).toEqual(["delivery.delivery_round_crossing_probe"]);
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

describe("le colisage a SON journal (K2, `colisage/colisage.md`, §10.3)", () => {
  const DAY = serviceDay();
  const packingTraces = () => ctx.prisma.packingDayChange.count({ where: { serviceDay: DAY } });
  const productionTraces = () =>
    ctx.prisma.productionDayChange.count({ where: { serviceDay: DAY } });

  it("une écriture du colisage inscrit la version de SA journée, chez lui seul", async () => {
    const [packing, production] = [await packingTraces(), await productionTraces()];

    await ctx.prisma.packingStock.createMany({
      data: ["A-1", "A-2"].map((sku) => ({ serviceDay: DAY, sku, received: 3 })),
    });

    expect((await packingTraces()) - packing).toBe(1);
    expect((await productionTraces()) - production).toBe(0);
  });

  it("chaque table du colisage qui porte une journée l'inscrit", async () => {
    const before = await packingTraces();
    await ctx.prisma.packingOrder.create({
      data: {
        serviceDay: DAY,
        orderId: "ord_1",
        reference: "CMD-0001",
        customerLabel: "Trois Ponts",
        fulfillmentMethod: "pickup",
        drawnAt: new Date(),
      },
    });
    await ctx.prisma.packingLine.create({
      data: { serviceDay: DAY, orderId: "ord_1", sku: "A-1", productName: "A", quantity: 1 },
    });
    await ctx.prisma.packingReceipt.create({
      data: {
        id: "b1",
        kind: "handoff",
        serviceDay: DAY,
        sku: "A-1",
        quantity: 1,
        receivedAt: new Date(),
      },
    });
    await ctx.prisma.packingReturn.create({
      data: {
        requestId: "return-1",
        serviceDay: DAY,
        sku: "A-1",
        handoffId: "b1",
        requested: 1,
        receivedAt: new Date(),
      },
    });

    expect((await packingTraces()) - before).toBe(4);
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
    await ctx.prisma.deliveryDayChange.createMany({
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
    // Le journal du commerce n'est pas le sien, ni celui de la livraison.
    expect(await ctx.prisma.orderDayChange.count()).toBe(2);
    expect(await ctx.prisma.deliveryDayChange.count()).toBe(2);
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
    expect(await ctx.prisma.deliveryDayChange.count()).toBe(2);
  });

  it("le passage nocturne de la livraison retire les traces de la livraison, et elles seules", async () => {
    await seedTraces();
    const response = await ctx
      .http()
      .post("/admin/livraison/journal/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    expect(response.body).toEqual({ pruned: 1 });
    const left = await ctx.prisma.deliveryDayChange.findMany({ select: { serviceDay: true } });
    expect(left).toEqual([{ serviceDay: "recent" }]);
    expect(await ctx.prisma.productionDayChange.count()).toBe(2);
    expect(await ctx.prisma.orderDayChange.count()).toBe(2);
  });

  it("refuse le balayage de la livraison sans le jeton machine", async () => {
    await ctx.http().post("/admin/livraison/journal/sweep").expect(401);
  });
});
