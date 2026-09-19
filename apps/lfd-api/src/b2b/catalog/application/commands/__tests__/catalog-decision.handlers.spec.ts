import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import type { JournaledEvent } from "../../../../../platform/journal/journal-fact.js";
import { CatalogItem, type PimFacts } from "../../../domain/entities/catalog-item.js";
import {
  CannotFeatureHiddenItemError,
  RedundantB2bPriceError,
} from "../../../domain/errors/catalog-errors.js";
import { CatalogItemNotFoundError } from "../../../domain/errors/catalog-not-found.error.js";
import { CatalogItemRepository } from "../../../domain/ports/catalog-item.repository.js";
import {
  AlignOnPimPriceCommand,
  SetB2bPriceCommand,
  SetCatalogFeaturedCommand,
  SetCatalogVisibilityCommand,
} from "../catalog-decision.commands.js";
import {
  AlignOnPimPriceHandler,
  SetB2bPriceHandler,
  SetCatalogFeaturedHandler,
  SetCatalogVisibilityHandler,
} from "../catalog-decision.handlers.js";

/**
 * Les faits des décisions de catalogue (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche
 * (b), 2026-09-19) : un fait par geste réel, écrit APRÈS l'article, et aucun
 * fait pour un geste sans effet. `receivedAt` n'est comparé à aucune horloge.
 */
const SKU = "VIE-001-1";
const PIM_PRICE = 210_000;
const NEGOTIATED = 190_000;

function article(): CatalogItem {
  const facts: PimFacts = {
    sku: SKU,
    productId: "p_VIE-001",
    productSku: "VIE-001",
    name: "Croissant",
    kind: "daily",
    categoryId: "c",
    priceMillicents: PIM_PRICE,
    weightGrams: null,
    isDefault: true,
    position: 0,
    vatRatePercent: 5.5,
    allergens: null,
    allergenLabels: null,
    note: null,
    image: null,
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

function build(seed: (item: CatalogItem) => void = () => undefined) {
  const steps: string[] = [];
  const items = new InMemoryCatalog(steps);
  const events = new StepRecordingPublisher(steps);
  const uow = new DirectUnitOfWork();
  const item = article();
  seed(item);
  items.put(item);
  return {
    steps,
    items,
    events,
    setPrice: new SetB2bPriceHandler(items, events, uow),
    align: new AlignOnPimPriceHandler(items, events, uow),
    visibility: new SetCatalogVisibilityHandler(items, events, uow),
    featured: new SetCatalogFeaturedHandler(items, events, uow),
  };
}

const facts = (events: RecordingPublisher) => events.traced.map((event) => event.journalFact());

describe("SetB2bPriceHandler", () => {
  it("journalise une première pose : pas d'avant, l'après en millicentimes", async () => {
    const { setPrice, events, steps } = build();

    await setPrice.execute(new SetB2bPriceCommand(SKU, NEGOTIATED, "fiche-1"));

    expect(steps).toEqual([`save:${SKU}`, "journal:catalog_item.b2b_price_set"]);
    expect(facts(events)).toEqual([
      {
        type: "catalog_item.b2b_price_set",
        subjectType: "catalog_item",
        subjectId: SKU,
        payload: { sku: SKU, before: null, after: { priceMillicents: NEGOTIATED } },
      },
    ]);
  });

  it("garde le prix remplacé dans l'avant", async () => {
    const { setPrice, events } = build((item) => item.setB2bPrice(NEGOTIATED, "fiche-0"));

    await setPrice.execute(new SetB2bPriceCommand(SKU, 180_000, "fiche-1"));

    expect(facts(events)[0]?.payload).toEqual({
      sku: SKU,
      before: { priceMillicents: NEGOTIATED },
      after: { priceMillicents: 180_000 },
    });
  });

  it("reposer le même prix n'écrit aucun fait", async () => {
    const { setPrice, events } = build((item) => item.setB2bPrice(NEGOTIATED, "fiche-0"));

    await setPrice.execute(new SetB2bPriceCommand(SKU, NEGOTIATED, "fiche-1"));

    expect(events.traced).toHaveLength(0);
  });

  it("un refus de l'agrégat n'écrit ni l'article ni le fait", async () => {
    const { setPrice, events, steps } = build();

    await expect(
      setPrice.execute(new SetB2bPriceCommand(SKU, PIM_PRICE, "fiche-1")),
    ).rejects.toBeInstanceOf(RedundantB2bPriceError);
    expect(steps).toEqual([]);
    expect(events.traced).toHaveLength(0);
  });

  it("un article disparu n'écrit aucun fait", async () => {
    const { setPrice, events } = build();

    await expect(
      setPrice.execute(new SetB2bPriceCommand("INCONNU-1", NEGOTIATED, "fiche-1")),
    ).rejects.toBeInstanceOf(CatalogItemNotFoundError);
    expect(events.traced).toHaveLength(0);
  });
});

describe("AlignOnPimPriceHandler", () => {
  it("journalise le retour au PIM avec le prix B2B retiré", async () => {
    const { align, events, steps, items } = build((item) => item.setB2bPrice(NEGOTIATED, "f"));

    await align.execute(new AlignOnPimPriceCommand(SKU));

    expect(items.current(SKU)?.b2bPriceMillicents).toBeNull();
    expect(steps).toEqual([`save:${SKU}`, "journal:catalog_item.b2b_price_cleared"]);
    expect(facts(events)).toEqual([
      {
        type: "catalog_item.b2b_price_cleared",
        subjectType: "catalog_item",
        subjectId: SKU,
        payload: { sku: SKU, before: { priceMillicents: NEGOTIATED } },
      },
    ]);
  });

  /** Un fait « revenu au PIM » sur un article qui le suivait mentirait au lecteur. */
  it("aligner un article qui suit déjà le PIM n'écrit aucun fait", async () => {
    const { align, events } = build();

    await expect(align.execute(new AlignOnPimPriceCommand(SKU))).resolves.toBeUndefined();

    expect(events.traced).toHaveLength(0);
  });
});

describe("SetCatalogVisibilityHandler", () => {
  it("masquer : le fait part après l'article", async () => {
    const { visibility, events, steps } = build();

    await visibility.execute(new SetCatalogVisibilityCommand(SKU, true, "fiche-1"));

    expect(steps).toEqual([`save:${SKU}`, "journal:catalog_item.hidden"]);
    expect(facts(events)).toEqual([
      {
        type: "catalog_item.hidden",
        subjectType: "catalog_item",
        subjectId: SKU,
        payload: { sku: SKU },
      },
    ]);
  });

  it("remettre en vente un article masqué journalise « shown »", async () => {
    const { visibility, events } = build((item) => item.hide("fiche-0"));

    await visibility.execute(new SetCatalogVisibilityCommand(SKU, false, "fiche-1"));

    expect(events.factTypes()).toEqual(["catalog_item.shown"]);
  });

  it("masquer un article déjà masqué n'écrit aucun fait", async () => {
    const { visibility, events } = build((item) => item.hide("fiche-0"));

    await visibility.execute(new SetCatalogVisibilityCommand(SKU, true, "fiche-1"));

    expect(events.traced).toHaveLength(0);
  });

  it("montrer un article visible n'écrit aucun fait", async () => {
    const { visibility, events } = build();

    await visibility.execute(new SetCatalogVisibilityCommand(SKU, false, "fiche-1"));

    expect(events.traced).toHaveLength(0);
  });
});

describe("SetCatalogFeaturedHandler", () => {
  it("mettre en avant : le fait part après l'article", async () => {
    const { featured, events, steps } = build();

    await featured.execute(new SetCatalogFeaturedCommand(SKU, true, "fiche-1"));

    expect(steps).toEqual([`save:${SKU}`, "journal:catalog_item.featured"]);
    expect(facts(events)).toEqual([
      {
        type: "catalog_item.featured",
        subjectType: "catalog_item",
        subjectId: SKU,
        payload: { sku: SKU },
      },
    ]);
  });

  it("retirer la mise en avant journalise « unfeatured »", async () => {
    const { featured, events } = build((item) => item.feature("fiche-0"));

    await featured.execute(new SetCatalogFeaturedCommand(SKU, false, "fiche-1"));

    expect(events.factTypes()).toEqual(["catalog_item.unfeatured"]);
  });

  it("retirer une mise en avant absente n'écrit aucun fait", async () => {
    const { featured, events } = build();

    await featured.execute(new SetCatalogFeaturedCommand(SKU, false, "fiche-1"));

    expect(events.traced).toHaveLength(0);
  });

  it("mettre en avant un article masqué est refusé, sans fait", async () => {
    const { featured, events } = build((item) => item.hide("fiche-0"));

    await expect(
      featured.execute(new SetCatalogFeaturedCommand(SKU, true, "fiche-1")),
    ).rejects.toBeInstanceOf(CannotFeatureHiddenItemError);
    expect(events.traced).toHaveLength(0);
  });
});
