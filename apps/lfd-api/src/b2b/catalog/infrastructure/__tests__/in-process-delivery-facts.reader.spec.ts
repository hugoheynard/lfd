import { CatalogItem, type PimFacts } from "../../domain/entities/catalog-item.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { InProcessDeliveryFactsReader } from "../in-process-delivery-facts.reader.js";

/**
 * Ce que ces cas tiennent : **ce que le référentiel a le droit d'apprendre** du
 * miroir. Rien n'attend plus de relecture depuis X2 (2026-10-17) : la boîte de
 * réception est partie avec le push, `awaitingSince` vaut toujours `null`.
 */

const RECU_LE = new Date("2026-01-01T08:00:00.000Z");

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
    publicTtcCents: 250,
    publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
    allergens: null,
    allergenLabels: null,
    orderTimeLimit: null,
    note: null,
    image: null,
    thumbnail: null,
    operationOnly: false,
    requiresCold: false,
    receivedAt: RECU_LE,
    ...over,
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

  /** Hors sujet ici, mais le port l'exige — un doublé incomplet dériverait. */
  loadByProduct(): Promise<CatalogItem[]> {
    return Promise.resolve([]);
  }

  saveMany(): Promise<void> {
    throw new Error("Le lecteur de faits n'écrit rien.");
  }

  removeMany(): Promise<void> {
    throw new Error("Le lecteur de faits n'écrit rien.");
  }
}

function build(options: { readonly mirror?: readonly CatalogItem[] }): {
  reader: InProcessDeliveryFactsReader;
  mirror: MirrorDouble;
} {
  const mirror = new MirrorDouble(options.mirror ?? []);
  const reader = new InProcessDeliveryFactsReader(mirror);
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
   * L'absence dit « la plateforme n'en sait rien ». Une entrée à `false`
   * serait une affirmation que rien ne soutient.
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

  /** Aucun SKU demandé : aucune lecture. Une fiche sans déclinaison ne coûte rien. */
  it("ne lit rien quand on ne lui demande rien", async () => {
    const { reader, mirror } = build({ mirror: [CatalogItem.receive(facts("VIE-001-1"))] });

    expect(await reader.factsFor([])).toEqual(new Map());
    expect(mirror.reads).toBe(0);
  });

  /** Le miroir est lu UNE fois — pas une lecture par question. */
  it("ne lit le miroir qu’une fois par appel", async () => {
    const { reader, mirror } = build({ mirror: [CatalogItem.receive(facts("VIE-001-1"))] });

    await reader.factsFor(["VIE-001-1"]);

    expect(mirror.reads).toBe(1);
  });
});
