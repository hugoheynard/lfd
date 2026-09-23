import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import type { JournaledEvent } from "../../../../../platform/journal/journal-fact.js";
import { CatalogItem, type PimFacts } from "../../../domain/entities/catalog-item.js";
import { CatalogItemRepository } from "../../../domain/ports/catalog-item.repository.js";

/**
 * Les faits des décisions de catalogue (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche
 * (b), 2026-09-19) : un fait par geste réel, écrit APRÈS l'article, et aucun
 * fait pour un geste sans effet. `receivedAt` n'est comparé à aucune horloge.
 */
export const SKU = "VIE-001-1";
export const PIM_PRICE = 210_000;
export const NEGOTIATED = 190_000;
/** Le nom de l'article, que chaque fait fige en `subjectLabel` (lot B du plan des phrases). */
export const NAME = "Croissant";

function article(): CatalogItem {
  const facts: PimFacts = {
    sku: SKU,
    productId: "p_VIE-001",
    productSku: "VIE-001",
    name: NAME,
    kind: "daily",
    categoryId: "c",
    priceMillicents: PIM_PRICE,
    weightGrams: null,
    isDefault: true,
    position: 0,
    vatRatePercent: 5.5,
    publicTtcCents: 250,
    publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
    allergens: null,
    allergenLabels: null,
    note: null,
    image: null,
    thumbnail: null,
    orderTimeLimit: null,
    receivedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  return CatalogItem.receive(facts);
}

/**
 * Le miroir en mémoire : il rend un agrégat RECONSTITUÉ à chaque chargement,
 * comme l'adaptateur — une mutation non sauvée ne survit donc pas.
 */
class InMemoryCatalog extends CatalogItemRepository {
  private readonly rows = new Map<string, CatalogItem>();

  constructor(private readonly steps: string[]) {
    super();
  }

  put(item: CatalogItem): void {
    this.rows.set(item.sku, CatalogItem.reconstitute(item.toPersistence()));
  }

  current(sku: string): CatalogItem | undefined {
    return this.rows.get(sku);
  }

  load(sku: string): Promise<CatalogItem | null> {
    const row = this.rows.get(sku);
    return Promise.resolve(
      row === undefined ? null : CatalogItem.reconstitute(row.toPersistence()),
    );
  }

  loadAll(): Promise<CatalogItem[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  loadAllIncludingWithdrawn(): Promise<CatalogItem[]> {
    return this.loadAll();
  }

  saveMany(items: readonly CatalogItem[]): Promise<void> {
    for (const item of items) {
      this.steps.push(`save:${item.sku}`);
      this.put(item);
    }
    return Promise.resolve();
  }
}

/** Le publieur partagé, qui note QUAND le fait part parmi les écritures. */
class StepRecordingPublisher extends RecordingPublisher {
  constructor(private readonly steps: string[]) {
    super();
  }

  override publishTraced(event: JournaledEvent): Promise<void> {
    this.steps.push(`journal:${event.journalFact().type}`);
    return super.publishTraced(event);
  }
}

/** Un article semé (éventuellement déjà décidé), ses doubles, et le fil des gestes. */
export function build(seed: (item: CatalogItem) => void = () => undefined) {
  const steps: string[] = [];
  const items = new InMemoryCatalog(steps);
  const events = new StepRecordingPublisher(steps);
  const uow = new DirectUnitOfWork();
  const item = article();
  seed(item);
  items.put(item);
  return { steps, items, events, uow };
}

/** Les faits publiés, tels que le journal les lira. */
export const facts = (events: RecordingPublisher) =>
  events.traced.map((event) => event.journalFact());
