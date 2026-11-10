import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CatalogPriceRetracer } from "../../../domain/ports/catalog-price-retracer.js";
import { RetracePricesFromReferentialHandler } from "../retrace-prices-from-referential.handler.js";

/** L'instant de la requête — comparé à rien d'autre qu'à lui-même. */
const NOW = new Date("2026-10-15T08:00:00.000Z");

/** Le retraceur doublé : il rend une file de réponses, et note l'instant reçu. */
class ScriptedRetracer extends CatalogPriceRetracer {
  readonly calls: Date[] = [];

  constructor(private readonly answers: (readonly string[])[]) {
    super();
  }

  retrace(at: Date): Promise<readonly string[]> {
    this.calls.push(at);
    return Promise.resolve(this.answers.shift() ?? []);
  }
}

function setup(answers: (readonly string[])[]) {
  const retracer = new ScriptedRetracer(answers);
  const events = new RecordingPublisher();
  const handler = new RetracePricesFromReferentialHandler(
    retracer,
    events,
    new DirectUnitOfWork(),
    new FixedClock(NOW),
  );
  return { retracer, events, handler };
}

/**
 * Le retraçage du lot D (`plan-catalogue-synchronise-par-audience.md`,
 * 2026-10-15) : l'historique reçoit le prix du référentiel là où sa dernière
 * trace en diffère, et le journal le dit — seulement quand quelque chose a
 * été écrit.
 */
describe("RetracePricesFromReferentialHandler", () => {
  it("retrace à l'instant de la requête et journalise les SKU retracés", async () => {
    const { retracer, events, handler } = setup([["PAT-002-1", "VIE-001-1"]]);

    await handler.execute();

    expect(retracer.calls).toEqual([NOW]);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "catalog_price_history.retraced",
        subjectType: "catalog_price_history",
        subjectId: "catalog",
        payload: { skus: ["PAT-002-1", "VIE-001-1"] },
      },
    ]);
  });

  it("un second appel, sans écart, n'écrit aucun fait", async () => {
    const { events, handler } = setup([["VIE-001-1"], []]);

    await handler.execute();
    await handler.execute();

    expect(events.factTypes()).toEqual(["catalog_price_history.retraced"]);
  });
});
