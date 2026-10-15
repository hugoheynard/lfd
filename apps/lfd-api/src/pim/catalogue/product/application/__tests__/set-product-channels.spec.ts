import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { KnownPointsOfSale } from "../../../shared/application/__tests__/journal-name-doubles.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { SalesContextRegistry } from "../../../../sales-contexts/domain/ports/sales-context.registry.js";
import type { SalesContext } from "../../../../sales-contexts/domain/value-objects/sales-context.js";
import { PointOfSaleOfferReader } from "../../../shared/domain/ports/point-of-sale-offer.reader.js";
import type { SalesChannels } from "../../../shared/domain/value-objects/sales-channels.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import { SetProductChannelsCommand, SetProductChannelsHandler } from "../set-product-channels.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";

/**
 * Une fiche qui ferme un canal garde ses dérogations de taux (2026-10-15) : la
 * TVA ne dépend plus des canaux. Le geste n'écrit que `channels_changed`.
 */

const CONTEXTS: readonly SalesContext[] = [
  {
    id: "ctx_emporter",
    key: "takeaway",
    label: "À emporter",
    handleSuffix: "",
    active: true,
    shopifyProjected: true,
    position: 1,
  },
  {
    id: "ctx_b2b",
    key: "b2b",
    label: "B2B",
    handleSuffix: "-b2b",
    active: true,
    shopifyProjected: false,
    position: 2,
  },
];

class ActiveContexts extends SalesContextRegistry {
  active(): Promise<readonly SalesContext[]> {
    return Promise.resolve(CONTEXTS);
  }
  all(): Promise<readonly SalesContext[]> {
    return Promise.resolve(CONTEXTS);
  }
  ensureRootContext(): Promise<void> {
    return Promise.resolve();
  }
  offeredByLocations(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(new Map());
  }
}

class OffersEverything extends PointOfSaleOfferReader {
  offersOf(ids: readonly string[]): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
    return Promise.resolve(new Map(ids.map((id) => [id, new Set(["takeaway", "b2b"])])));
  }
}

const TAKEAWAY: SalesChannels = [{ pointOfSaleId: "emp_1", context: "takeaway" }];
const BOTH: SalesChannels = [...TAKEAWAY, { pointOfSaleId: "pos_b2b", context: "b2b" }];

/** Reconstitue à chaque lecture : le handler ne tient pas l'instance du test. */
class OneProduct extends ProductRepository {
  constructor(private current: ProductSnapshot) {
    super();
  }
  get stored(): ProductSnapshot {
    return this.current;
  }
  findById(id: string): Promise<Product | null> {
    return Promise.resolve(id === this.current.id ? Product.reconstitute(this.current) : null);
  }
  listAll(): Promise<Product[]> {
    return Promise.resolve([]);
  }
  add(product: Product): Promise<void> {
    return this.save(product);
  }
  save(product: Product): Promise<void> {
    // L'instantané NON résolu, exactement comme l'adaptateur Prisma. `snapshot()`
    // résout l'héritage : l'écrire ici recopierait la fiche et le tarif du défaut
    // dans les colonnes PROPRES d'une déclinaison alignée — la faute 0b/0d du plan
    // `plan-separer-allergenes-et-nutrition.md`, rejouée par le double, qui rendait
    // vert ce que la vraie base refuse de faire (constaté le 2026-09-22).
    this.current = product.persistenceSnapshot();
    return Promise.resolve();
  }
}

function tart(
  vatByContext: Readonly<Record<string, string>>,
  channelOverride: SalesChannels | null,
): OneProduct {
  return new OneProduct({
    id: "prd_1",
    sku: "TAR-1",
    name: { fr: "Tarte" },
    slug: { fr: "tarte" },
    kind: "daily",
    categoryId: "cat_1",
    status: "draft",
    variants: [
      {
        id: "prd_1_v1",
        sku: "TAR-1-1",
        name: { fr: "Tarte" },
        options: {},
        isDefault: true,
        isDiscontinued: false,
        position: 0,
        priceCents: null,
        weightGrams: null,
        proPriceMillicents: null,
        regulatoryFollowsDefault: false,
        nutritionFollowsDefault: false,
        pricingFollowsDefault: false,
        allergenSheet: null,
        nutrition: null,
      },
    ],
    vatByContext,
    channelOverride,
    operationOnly: false,
    requiresCold: false,
    audience: null,
  });
}

async function setChannels(
  products: OneProduct,
  journal: RecordingJournal,
  channels: SalesChannels | null,
): Promise<void> {
  await new SetProductChannelsHandler(
    products,
    new OffersEverything(),
    new ActiveContexts(),
    new KnownPointsOfSale({ emp_1: "Boutique du Village", pos_b2b: "Plateforme pro" }),
    journal,
    new DirectUnitOfWork(),
    new RecordingCatalogEmitter(),
  ).execute(new SetProductChannelsCommand("prd_1", channels));
}

describe("SetProductChannelsHandler — la TVA ne suit plus les canaux", () => {
  /** Régression : jusqu'au 2026-10-15, fermer le canal B2B effaçait la dérogation B2B. */
  it("fermer un canal garde la dérogation qui y était et n'écrit que le fait des canaux", async () => {
    const products = tart({ b2b: "tva_20" }, null);
    const journal = new RecordingJournal();

    await setChannels(products, journal, TAKEAWAY);

    expect(products.stored.vatByContext).toEqual({ b2b: "tva_20" });
    expect(journal.types()).toEqual(["product.channels_changed"]);
    // La matrice, nommée : « hérité » d'un côté, les lignes de l'autre.
    expect(journal.entries[0]?.payload).toEqual({
      subjectLabel: "Tarte",
      from: "inherited",
      to: [
        {
          pointOfSale: { id: "emp_1", name: "Boutique du Village" },
          context: { id: "takeaway", name: "À emporter" },
        },
      ],
    });
  });

  it("n'écrit pas de fait de TVA quand la fiche revient à une famille qui vend partout", async () => {
    const products = tart({ takeaway: "tva_20" }, TAKEAWAY);
    const journal = new RecordingJournal();

    await setChannels(products, journal, null);

    expect(products.stored.vatByContext).toEqual({ takeaway: "tva_20" });
    expect(journal.types()).toEqual(["product.channels_changed"]);
  });

  it("reste muet quand la matrice est réenregistrée à l'identique", async () => {
    const products = tart({ b2b: "tva_20" }, BOTH);
    const journal = new RecordingJournal();

    await setChannels(products, journal, BOTH);

    expect(journal.types()).toEqual([]);
  });
});
