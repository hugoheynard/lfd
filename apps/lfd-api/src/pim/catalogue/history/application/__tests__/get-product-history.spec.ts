import {
  ProductHistoryJournal,
  UnknownHistoryAnchorError,
  type HistoryFact,
  type HistoryPage,
  type HistoryPageRequest,
} from "../../../../journal/product-history-journal.js";
import { ProductNotFoundError } from "../../../product/domain/errors/product-errors.js";
import type { ProductLineage } from "../../domain/product-lineage.js";
import { ProductLineageReader } from "../../domain/ports/product-lineage.reader.js";
import { GetProductHistoryHandler, GetProductHistoryQuery } from "../get-product-history.js";

const LINEAGE: ProductLineage = {
  productId: "prd_1",
  categories: [{ id: "cat_tartes", label: "Tartes" }],
  vatRates: [{ id: "vat_55", label: "Taux réduit" }],
  ingredients: [],
  appellations: [],
  revisions: [{ id: "rev_1", hash: "h_1" }],
};

class FixedLineages extends ProductLineageReader {
  readonly asked: string[] = [];

  constructor(private readonly lineage: ProductLineage | null) {
    super();
  }

  lineageOf(productId: string): Promise<ProductLineage | null> {
    this.asked.push(productId);
    return Promise.resolve(this.lineage);
  }
}

/** Rend la page qu'on lui confie, et garde la demande pour qu'on la relise. */
class ScriptedJournal extends ProductHistoryJournal {
  readonly requests: HistoryPageRequest[] = [];

  constructor(private readonly answer: HistoryPage | Error) {
    super();
  }

  page(request: HistoryPageRequest): Promise<HistoryPage> {
    this.requests.push(request);
    return this.answer instanceof Error
      ? Promise.reject(this.answer)
      : Promise.resolve(this.answer);
  }
}

const AT = new Date(0);

function fact(id: string, subjectType: string, subjectId: string, payload: unknown): HistoryFact {
  return {
    id,
    type: `${subjectType}.renamed`,
    subjectType,
    subjectId,
    occurredAt: AT,
    actorName: "Colette Bréal",
    actorType: "staff",
    payload,
  };
}

describe("GetProductHistoryHandler", () => {
  it("refuse une fiche inconnue sans interroger le journal", async () => {
    const journal = new ScriptedJournal({ facts: [], total: 0, asOf: null });
    const handler = new GetProductHistoryHandler(new FixedLineages(null), journal);

    await expect(
      handler.execute(new GetProductHistoryQuery("prd_x", 1, 20, null)),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(journal.requests).toEqual([]);
  });

  it("demande au journal les fils de la lignée, la page et l'ancre telles quelles", async () => {
    const journal = new ScriptedJournal({ facts: [], total: 0, asOf: null });
    const lineages = new FixedLineages(LINEAGE);
    const handler = new GetProductHistoryHandler(lineages, journal);

    await handler.execute(new GetProductHistoryQuery("prd_1", 3, 10, "evt_anchor"));

    expect(lineages.asked).toEqual(["prd_1"]);
    expect(journal.requests).toHaveLength(1);
    expect(journal.requests[0]).toMatchObject({ page: 3, pageSize: 10, asOf: "evt_anchor" });
    expect(journal.requests[0]?.threads.map((thread) => thread.subjectType)).toEqual([
      "product",
      "product",
      "product_category",
      "vat_rate",
      "catalog_revision",
      "catalog_revision",
    ]);
  });

  it("rend chaque fait dans son cercle, dans l'ordre du journal", async () => {
    const journal = new ScriptedJournal({
      facts: [
        fact("evt_3", "catalog_revision", "h_1", { hash: "h_1" }),
        fact("evt_2", "product_category", "cat_tartes", { before: "Tarte", after: "Tartes" }),
        fact("evt_1", "product", "prd_1", { changes: {} }),
      ],
      total: 41,
      asOf: "evt_9",
    });
    const handler = new GetProductHistoryHandler(new FixedLineages(LINEAGE), journal);

    const view = await handler.execute(new GetProductHistoryQuery("prd_1", 2, 3, "evt_9"));

    expect(view).toMatchObject({ total: 41, page: 2, pageSize: 3, asOf: "evt_9" });
    expect(view.entries).toEqual([
      expect.objectContaining({ id: "evt_3", circle: "revision" }),
      expect.objectContaining({
        id: "evt_2",
        circle: "inherited",
        inheritedFrom: { kind: "category", id: "cat_tartes", label: "Tartes" },
        payload: { before: "Tarte", after: "Tartes" },
      }),
      expect.objectContaining({
        id: "evt_1",
        circle: "product",
        occurredAt: AT.toISOString(),
        actorName: "Colette Bréal",
        subjectType: "product",
        subjectId: "prd_1",
      }),
    ]);
  });

  it("rend vide une charge qui n'est pas un objet, plutôt que de l'inventer", async () => {
    const journal = new ScriptedJournal({
      facts: [fact("evt_1", "product", "prd_1", ["pas", "un", "objet"])],
      total: 1,
      asOf: "evt_1",
    });
    const handler = new GetProductHistoryHandler(new FixedLineages(LINEAGE), journal);

    const view = await handler.execute(new GetProductHistoryQuery("prd_1", 1, 20, null));

    expect(view.entries[0]?.payload).toEqual({});
  });

  it("laisse passer le refus d'une ancre inconnue", async () => {
    const journal = new ScriptedJournal(new UnknownHistoryAnchorError("evt_perdu"));
    const handler = new GetProductHistoryHandler(new FixedLineages(LINEAGE), journal);

    await expect(
      handler.execute(new GetProductHistoryQuery("prd_1", 2, 20, "evt_perdu")),
    ).rejects.toBeInstanceOf(UnknownHistoryAnchorError);
  });
});
