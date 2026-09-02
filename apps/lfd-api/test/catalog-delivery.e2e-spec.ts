import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import { CatalogDelivery } from "../src/b2b/catalog/domain/entities/catalog-delivery.js";
import { CatalogDeliveryRepository } from "../src/b2b/catalog/domain/ports/catalog-delivery.repository.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

/**
 * **L'invariant que seul ce niveau peut prouver** : au plus UNE arrivée en
 * attente, et c'est Postgres qui le tient.
 *
 * « Une livraison remplace l'arrivée en attente ; il y en a zéro ou une, jamais
 * deux » est ce qui fait que l'ordre cesse d'être une question — on ne peut pas
 * valider une arrivée périmée, elle n'existe plus. Un invariant de ce poids ne
 * se confie pas à une garde applicative : deux livraisons simultanées la
 * contourneraient, et le relecteur validerait alors une arrivée que le PIM a
 * déjà remplacée.
 *
 * Un test de handler ne prouverait rien ici. Il ne voit ni l'index partiel, ni
 * la transaction, ni ce que la base a réellement gardé.
 */

let ctx: E2eContext;
let deliveries: CatalogDeliveryRepository;

beforeAll(async () => {
  ctx = await bootstrapE2e();
  deliveries = ctx.app.get(CatalogDeliveryRepository);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/**
 * Écarte le `null` en ÉCHOUANT, pas en le castant.
 *
 * `as CatalogDelivery` aurait tu le seul cas où ce test aurait quelque chose à
 * dire : une arrivée qu'on croit posée et qui ne l'est pas. Le dépôt refuse les
 * casts pour cette raison exacte — ils déplacent une question au lieu d'y
 * répondre.
 */
function must(delivery: CatalogDelivery | null): CatalogDelivery {
  if (delivery === null) {
    throw new Error("Aucune arrivée en attente — le test attendait le contraire.");
  }
  return delivery;
}

const snapshot = (generatedAt: string): CatalogSnapshot => ({
  version: CATALOG_SNAPSHOT_VERSION,
  generatedAt,
  categories: [],
  products: [],
});

let seq = 0;
function delivered(fingerprint: string): CatalogDelivery {
  seq += 1;
  return CatalogDelivery.receive({
    id: `d_${seq}`,
    revisionId: `rev_${seq}`,
    // Les dates ne sont ici comparées qu'ENTRE elles — jamais à l'horloge : le
    // sujet est l'état de l'arrivée, pas une fenêtre temporelle.
    snapshot: snapshot("2026-01-01T00:00:00.000Z"),
    fingerprint,
    receivedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}

describe("la boîte de réception du catalogue", () => {
  it("pose une arrivée en attente, et la relit telle quelle", async () => {
    await deliveries.deliver(delivered("empreinte-A"));

    const waiting = await deliveries.pending();

    expect(waiting?.fingerprint).toBe("empreinte-A");
    expect(waiting?.currentStatus).toBe("pending");
    // Le snapshot ENTIER survit à l'aller-retour : c'est lui qui rend « ce qui
    // sort » validable, un retrait n'étant qu'une absence.
    expect(waiting?.snapshot.version).toBe(CATALOG_SNAPSHOT_VERSION);
  });

  /**
   * 🔴 Le cœur. Sans la transaction de `deliver`, la seconde livraison se
   * heurterait à l'index partiel et le PIM verrait un échec là où il a livré —
   * un catalogue qui ne part jamais, sans que rien ne le dise.
   */
  it("REMPLACE l’arrivée en attente au lieu d’en poser une seconde", async () => {
    await deliveries.deliver(delivered("empreinte-A"));
    await deliveries.deliver(delivered("empreinte-B"));

    const waiting = await deliveries.pending();
    const rows = await ctx.prisma.catalogDelivery.findMany({ orderBy: { id: "asc" } });

    expect(waiting?.fingerprint).toBe("empreinte-B");
    // L'ancienne n'est pas supprimée — elle est marquée. Le fait qu'une
    // relecture ait été effacée sous les yeux de quelqu'un doit rester lisible.
    expect(rows.map((row) => row.status)).toEqual(["superseded", "pending"]);
  });

  it("laisse repartir une arrivée neuve après une validation", async () => {
    await deliveries.deliver(delivered("empreinte-A"));
    const first = must(await deliveries.pending());
    first.accept(["VIE-001-1"], new Date("2026-01-02T00:00:00.000Z"), "staff_1");
    await deliveries.save(first);

    await deliveries.deliver(delivered("empreinte-B"));

    expect((await deliveries.pending())?.fingerprint).toBe("empreinte-B");
    expect(await ctx.prisma.catalogDelivery.count({ where: { status: "accepted" } })).toBe(1);
  });

  /**
   * `null` (jamais validée) et `[]` (validée, rien d'écarté) ne se confondent
   * pas — et sur une colonne `jsonb`, c'est le genre de distinction qui se perd
   * à l'écriture sans que rien ne le signale.
   */
  it("distingue « jamais validée » de « validée sans rien écarter »", async () => {
    await deliveries.deliver(delivered("empreinte-A"));
    const waiting = must(await deliveries.pending());

    expect(waiting.excludedSkus).toBeNull();

    waiting.accept([], new Date("2026-01-02T00:00:00.000Z"), "staff_1");
    await deliveries.save(waiting);

    expect(must(await deliveries.byId(waiting.id)).excludedSkus).toEqual([]);
  });

  /** Rien n'est arrivé : la lecture le dit, elle n'invente pas une arrivée vide. */
  it("ne rend rien quand aucune livraison n’a eu lieu", async () => {
    expect(await deliveries.pending()).toBeNull();
  });
});
