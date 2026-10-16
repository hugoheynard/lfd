import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { KnownPointsOfSale } from "../../../shared/application/__tests__/journal-name-doubles.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { SalesContextRegistry } from "../../../../sales-contexts/domain/ports/sales-context.registry.js";
import type { SalesContext } from "../../../../sales-contexts/domain/value-objects/sales-context.js";
import { PointOfSaleOfferReader } from "../../../shared/domain/ports/point-of-sale-offer.reader.js";
import type { SalesChannels } from "../../../shared/domain/value-objects/sales-channels.js";
import { Category, type CategorySnapshot } from "../../domain/entities/category.js";
import { CategoryRepository } from "../../domain/ports/category.repository.js";
import {
  SetCategoryChannelsCommand,
  SetCategoryChannelsHandler,
} from "../set-category-channels.js";
import {
  RecordingCatalogEmitter,
  RecordingCatalogReemission,
} from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";

/**
 * Fermer un canal n'efface plus aucun taux (2026-10-15) : la TVA ne dépend
 * plus des canaux. Le geste n'écrit donc que `channels_changed`.
 */

const CONTEXTS: readonly SalesContext[] = [
  {
    id: "ctx_emporter",
    key: "takeaway",
    label: "À emporter",
    active: true,
    position: 1,
  },
  {
    id: "ctx_b2b",
    key: "b2b",
    label: "B2B",
    active: true,
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

/** Tout point de vente cité existe et offre tout : l'offre n'est pas le sujet. */
class OffersEverything extends PointOfSaleOfferReader {
  offersOf(ids: readonly string[]): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
    return Promise.resolve(new Map(ids.map((id) => [id, new Set(["takeaway", "b2b"])])));
  }
}

/** Une seule famille, reconstituée à chaque lecture comme le ferait la base. */
class OneCategory extends CategoryRepository {
  constructor(private current: CategorySnapshot) {
    super();
  }
  get stored(): CategorySnapshot {
    return this.current;
  }
  findById(id: string): Promise<Category | null> {
    return Promise.resolve(id === this.stored.id ? Category.reconstitute(this.stored) : null);
  }
  findBySlugFr(): Promise<Category | null> {
    return Promise.resolve(null);
  }
  listAll(): Promise<Category[]> {
    return Promise.resolve([Category.reconstitute(this.stored)]);
  }
  listChildren(): Promise<Category[]> {
    return Promise.resolve([]);
  }
  add(category: Category): Promise<void> {
    return this.save(category);
  }
  save(category: Category): Promise<void> {
    this.current = category.snapshot();
    return Promise.resolve();
  }
  saveAll(): Promise<void> {
    return Promise.resolve();
  }
  countActiveChildren(): Promise<number> {
    return Promise.resolve(0);
  }
  nextPosition(): Promise<number> {
    return Promise.resolve(0);
  }
}

const TAKEAWAY: SalesChannels = [{ pointOfSaleId: "emp_1", context: "takeaway" }];
const BOTH: SalesChannels = [...TAKEAWAY, { pointOfSaleId: "pos_b2b", context: "b2b" }];

function family(
  vatByContext: Readonly<Record<string, string>>,
  channelPreset: SalesChannels = BOTH,
): OneCategory {
  return new OneCategory({
    id: "cat_1",
    name: { fr: "Viennoiseries" },
    slug: { fr: "viennoiseries" },
    parentId: null,
    position: 0,
    isArchived: false,
    channelPreset,
    vatByContext,
    audience: "both",
  });
}

async function setChannels(
  repo: OneCategory,
  journal: RecordingJournal,
  channels: SalesChannels,
): Promise<void> {
  await new SetCategoryChannelsHandler(
    repo,
    new OffersEverything(),
    new ActiveContexts(),
    new KnownPointsOfSale({ emp_1: "Boutique du Village", pos_b2b: "Plateforme pro" }),
    journal,
    new DirectUnitOfWork(),
    new RecordingCatalogEmitter(),
    new RecordingCatalogReemission(),
  ).execute(new SetCategoryChannelsCommand("cat_1", channels));
}

describe("SetCategoryChannelsHandler — la TVA ne suit plus les canaux", () => {
  /** Régression : jusqu'au 2026-10-15, fermer le canal B2B effaçait le taux B2B. */
  it("fermer un canal garde son taux et n'écrit que le fait des canaux", async () => {
    const repo = family({ b2b: "tva_20", takeaway: "tva_55" });
    const journal = new RecordingJournal();

    await setChannels(repo, journal, TAKEAWAY);

    expect(repo.stored.vatByContext).toEqual({ b2b: "tva_20", takeaway: "tva_55" });
    expect(journal.types()).toEqual(["product_category.channels_changed"]);
    expect(journal.entries[0]?.payload).toEqual({
      subjectLabel: "Viennoiseries",
      changes: {
        channels: {
          from: [
            {
              pointOfSale: { id: "emp_1", name: "Boutique du Village" },
              context: { id: "takeaway", name: "À emporter" },
            },
            {
              pointOfSale: { id: "pos_b2b", name: "Plateforme pro" },
              context: { id: "b2b", name: "B2B" },
            },
          ],
          to: [
            {
              pointOfSale: { id: "emp_1", name: "Boutique du Village" },
              context: { id: "takeaway", name: "À emporter" },
            },
          ],
        },
      },
    });
  });

  it("n'écrit pas de fait de TVA quand on OUVRE un canal", async () => {
    const repo = family({ takeaway: "tva_55" }, TAKEAWAY);
    const journal = new RecordingJournal();

    await setChannels(repo, journal, BOTH);

    expect(journal.types()).toEqual(["product_category.channels_changed"]);
  });

  it("reste muet quand la grille est réenregistrée à l'identique", async () => {
    const repo = family({ b2b: "tva_20", takeaway: "tva_55" });
    const journal = new RecordingJournal();

    await setChannels(repo, journal, BOTH);

    expect(journal.types()).toEqual([]);
    expect(repo.stored.vatByContext).toEqual({ b2b: "tva_20", takeaway: "tva_55" });
  });
});
