import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import { CatalogDelivery } from "../../domain/entities/catalog-delivery.js";
import { CatalogItem, type PimFacts } from "../../domain/entities/catalog-item.js";
import { CatalogDeliveryRepository } from "../../domain/ports/catalog-delivery.repository.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { InProcessDeliveryFactsReader } from "../in-process-delivery-facts.reader.js";

/**
 * Ce que ces cas tiennent : **ce que le référentiel a le droit d'apprendre**, et
 * surtout le retrait — le seul changement qui n'apparaît pas dans la liste des
 * SKU livrés, puisqu'il en est l'absence.
 */

const RECU_LE = new Date("2026-01-01T08:00:00.000Z");
const LIVRE_LE = new Date("2026-01-03T09:00:00.000Z");

function facts(sku: string, over: Partial<PimFacts> = {}): PimFacts {
  return {
    sku,
    productId: `p_${sku}`,
    productSku: sku,
    name: sku,
    kind: "daily",
    categoryId: "c_vie",
    priceMillicents: 210_000,
    weightGrams: 80,
    isDefault: true,
    position: 0,
    vatRatePercent: 5.5,
    allergens: null,
    allergenLabels: null,
    receivedAt: RECU_LE,
    ...over,
  };
}

/** Un snapshot livré, réduit à ce que la comparaison regarde. */
function snapshot(variants: readonly { sku: string; priceMillicents?: number }[]): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: "2026-01-03T09:00:00.000Z",
    categories: [],
    products: variants.map((variant) => ({
      id: `p_${variant.sku}`,
      sku: variant.sku,
      name: variant.sku,
      categoryId: "c_vie",
      kind: "daily" as const,
      variants: [
        {
          sku: variant.sku,
          name: variant.sku,
          priceMillicents: variant.priceMillicents ?? 210_000,
          weightGrams: 80,
          isDefault: true,
          position: 0,
          vatRatePercent: 5.5,
          allergens: null,
          allergenLabels: null,
        },
      ],
    })),
  };
}

/**
 * Les doubles **étendent** les ports plutôt que d'être castés vers eux : un
 * `as unknown as` compilerait aussi le jour où le port gagne une méthode que
 * l'adaptateur appelle — et le test passerait en interrogeant un objet qui ne
 * l'a pas.
 *
 * Les méthodes d'écriture lèvent : ce lecteur n'a rien à écrire, et si ça
 * changeait, le test doit le dire au lieu de l'accepter en silence.
 */
class MirrorDouble extends CatalogItemRepository {
  reads = 0;

  constructor(private readonly items: readonly CatalogItem[]) {
    super();
  }

  load(): Promise<CatalogItem | null> {
    throw new Error("Le lecteur de faits ne charge jamais un article isolé.");
  }

  loadAll(): Promise<CatalogItem[]> {
    this.reads += 1;
    return Promise.resolve([...this.items]);
  }

  loadAllIncludingWithdrawn(): Promise<CatalogItem[]> {
    throw new Error("Le lecteur de faits ne parle QUE du catalogue en vente.");
  }

  saveMany(): Promise<void> {
    throw new Error("Le lecteur de faits n'écrit rien.");
  }

  removeMany(): Promise<void> {
    throw new Error("Le lecteur de faits n'écrit rien.");
  }
}

class InboxDouble extends CatalogDeliveryRepository {
  constructor(private readonly waiting: CatalogSnapshot | undefined) {
    super();
  }

  pending(): Promise<CatalogDelivery | null> {
    return Promise.resolve(
      this.waiting === undefined
        ? null
        : CatalogDelivery.receive({
            id: "d_1",
            revisionId: "rev_1",
            snapshot: this.waiting,
            fingerprint: "empreinte-A",
            receivedAt: LIVRE_LE,
          }),
    );
  }

  byId(): Promise<CatalogDelivery | null> {
    throw new Error("Le lecteur de faits ne vise jamais une arrivée précise.");
  }

  close(): Promise<void> {
    throw new Error("Le lecteur de faits n'écrit rien.");
  }

  deliver(): Promise<void> {
    throw new Error("Le lecteur de faits n'écrit rien.");
  }
}

function build(options: {
  readonly mirror?: readonly CatalogItem[];
  readonly pending?: CatalogSnapshot;
}): { reader: InProcessDeliveryFactsReader; mirror: MirrorDouble } {
  const mirror = new MirrorDouble(options.mirror ?? []);
  const reader = new InProcessDeliveryFactsReader(mirror, new InboxDouble(options.pending));
  return { reader, mirror };
}

describe("InProcessDeliveryFactsReader", () => {
  it("dit accepté, et depuis quelle livraison les faits datent", async () => {
    const { reader } = build({ mirror: [CatalogItem.receive(facts("VIE-001-1"))] });

    const found = await reader.factsFor(["VIE-001-1"]);

    expect(found.get("VIE-001-1")).toEqual({
      sku: "VIE-001-1",
      accepted: true,
      factsReceivedAt: RECU_LE,
      awaitingSince: null,
    });
  });

  /**
   * L'absence dit « la plateforme n'en sait rien ». Une entrée à `false` sans
   * arrivée serait une affirmation que rien ne soutient.
   */
  it("ne rend AUCUNE entrée pour un SKU que la plateforme ignore", async () => {
    const { reader } = build({ mirror: [] });

    expect(await reader.factsFor(["VIE-001-1"])).toEqual(new Map());
  });

  it("ne rend que les SKU demandés", async () => {
    const { reader } = build({
      mirror: [CatalogItem.receive(facts("VIE-001-1")), CatalogItem.receive(facts("PAT-002-1"))],
    });

    const found = await reader.factsFor(["VIE-001-1"]);

    expect([...found.keys()]).toEqual(["VIE-001-1"]);
  });

  it("signale l’arrivée qui change un article en vente", async () => {
    const { reader } = build({
      mirror: [CatalogItem.receive(facts("VIE-001-1"))],
      pending: snapshot([{ sku: "VIE-001-1", priceMillicents: 999_000 }]),
    });

    expect(await reader.factsFor(["VIE-001-1"])).toEqual(
      new Map([
        [
          "VIE-001-1",
          {
            sku: "VIE-001-1",
            accepted: true,
            factsReceivedAt: RECU_LE,
            awaitingSince: LIVRE_LE,
          },
        ],
      ]),
    );
  });

  /**
   * 🔴 LE cas qui justifie de passer par le diff plutôt que par la liste des SKU
   * livrés : un **retrait** est l'ABSENCE d'un SKU dans le snapshot. Lire la
   * liste des livrés ne le verrait jamais — et c'est pourtant celui où le
   * référentiel a le plus besoin de savoir qu'une décision attend.
   */
  it("signale le RETRAIT qui attend, que rien dans l’arrivée ne porte", async () => {
    const { reader } = build({
      mirror: [CatalogItem.receive(facts("VIE-001-1")), CatalogItem.receive(facts("PAT-002-1"))],
      pending: snapshot([{ sku: "VIE-001-1" }]),
    });

    const found = await reader.factsFor(["PAT-002-1"]);

    expect(found.get("PAT-002-1")).toMatchObject({ accepted: true, awaitingSince: LIVRE_LE });
  });

  /**
   * Un article neuf qui attend d'être relu n'existe nulle part côté plateforme.
   * Sans cette entrée, la fiche dirait « poussée », puis plus rien — et le
   * commercial chercherait la panne du mauvais côté.
   */
  it("rend une entrée non acceptée pour un article qui n’attend que sa validation", async () => {
    const { reader } = build({ mirror: [], pending: snapshot([{ sku: "NEW-001-1" }]) });

    expect(await reader.factsFor(["NEW-001-1"])).toEqual(
      new Map([
        [
          "NEW-001-1",
          {
            sku: "NEW-001-1",
            accepted: false,
            factsReceivedAt: null,
            awaitingSince: LIVRE_LE,
          },
        ],
      ]),
    );
  });

  /**
   * Une arrivée qui n'apporte rien pour CET article ne le met pas en attente.
   * Le diff est calculé à la lecture précisément pour ça : figé à la réception,
   * il signalerait un écart que le miroir a depuis rattrapé.
   */
  it("se tait quand l’arrivée ne change rien pour cet article", async () => {
    const { reader } = build({
      mirror: [CatalogItem.receive(facts("VIE-001-1"))],
      pending: snapshot([{ sku: "VIE-001-1" }]),
    });

    expect((await reader.factsFor(["VIE-001-1"])).get("VIE-001-1")?.awaitingSince).toBeNull();
  });

  /** Aucun SKU demandé : aucune lecture. Une fiche sans déclinaison ne coûte rien. */
  it("ne lit rien quand on ne lui demande rien", async () => {
    const { reader, mirror } = build({ mirror: [CatalogItem.receive(facts("VIE-001-1"))] });

    expect(await reader.factsFor([])).toEqual(new Map());
    expect(mirror.reads).toBe(0);
  });

  /** Le miroir est lu UNE fois, diff compris — pas une lecture par question. */
  it("ne lit le miroir qu’une fois par appel", async () => {
    const { reader, mirror } = build({
      mirror: [CatalogItem.receive(facts("VIE-001-1"))],
      pending: snapshot([{ sku: "VIE-001-1", priceMillicents: 999_000 }]),
    });

    await reader.factsFor(["VIE-001-1"]);

    expect(mirror.reads).toBe(1);
  });
});
