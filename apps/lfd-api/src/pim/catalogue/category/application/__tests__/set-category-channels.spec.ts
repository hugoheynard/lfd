import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
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

/**
 * Fermer un canal efface le taux du contexte fermé — et la comptabilité doit
 * le relire (Hugo, 2026-09-19). Le fait de TVA ordinaire accompagne donc
 * `channels_changed`, mais SEULEMENT quand un taux a réellement disparu.
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
    journal,
    new DirectUnitOfWork(),
  ).execute(new SetCategoryChannelsCommand("cat_1", channels));
}

describe("SetCategoryChannelsHandler — les taux qu'une fermeture efface", () => {
  it("écrit le fait de TVA quand fermer un canal efface son taux", async () => {
    const repo = family({ b2b: "tva_20", takeaway: "tva_55" });
    const journal = new RecordingJournal();

    await setChannels(repo, journal, TAKEAWAY);

    expect(repo.stored.vatByContext).toEqual({ takeaway: "tva_55" });
    expect(journal.types()).toEqual([
      "product_category.channels_changed",
      "product_category.vat_changed",
    ]);
    expect(journal.entries[1]).toMatchObject({
      subjectType: "product_category",
      subjectId: "cat_1",
      payload: { b2b: { from: "tva_20", to: null } },
    });
  });

  it("n'écrit pas de fait de TVA quand le canal fermé ne portait aucun taux", async () => {
    const repo = family({ takeaway: "tva_55" });
    const journal = new RecordingJournal();

    await setChannels(repo, journal, TAKEAWAY);

    expect(journal.types()).toEqual(["product_category.channels_changed"]);
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
