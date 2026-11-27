import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { DurablePublisher } from "../../../../../platform/outbox/durable-publisher.js";
import type { DurableFact } from "../../../../../platform/outbox/durable-event.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  PlannedColumnPlacement,
  type PlannedColumnPlacementOutcome,
  type PlannedColumnPlacementRequest,
} from "../../../../channels/commerce/planned-column-placement.js";
import { IsoDate } from "../../../../basket/domain/value-objects/iso-date.js";
import { PlannedColumn } from "../../../domain/entities/planned-column.js";
import { PlannedLine } from "../../../domain/value-objects/planned-line.js";
import { ConversionSchedule } from "../../services/conversion-schedule.js";
import { PlannedColumnConversion } from "../../services/planned-column-conversion.js";
import { InMemoryPlannedColumns, RecordingBasketCheck } from "../../__tests__/planner-doubles.js";
import { SweepPlannedColumnsHandler } from "../sweep-planned-columns.handler.js";

// Les instants ne sont comparés qu'à l'horloge doublée : « aujourd'hui » = 2026-12-01 à Paris.
const NOW = new Date("2026-12-01T08:00:00.000Z");
const TODAY = IsoDate.fromString("2026-12-01");
/** Le seigle ferme à 8 h 10 : la colonne qui le porte se commande déjà. */
const RYE_CLOSES = new Date("2026-12-01T08:10:00.000Z");
/** Le croissant ferme le lendemain à 13 h. */
const CRO_CLOSES = new Date("2026-12-02T12:00:00.000Z");

/** Une passation écrite à la main : rend la réponse du SKU de la première ligne. */
class ScriptedPlacement extends PlannedColumnPlacement {
  readonly asked: PlannedColumnPlacementRequest[] = [];

  constructor(
    private readonly answers: Readonly<Record<string, PlannedColumnPlacementOutcome | Error>> = {},
  ) {
    super();
  }

  place(request: PlannedColumnPlacementRequest): Promise<PlannedColumnPlacementOutcome> {
    this.asked.push(request);
    const answer = this.answers[request.lines[0]?.sku ?? ""];
    if (answer instanceof Error) {
      return Promise.reject(answer);
    }
    return Promise.resolve(
      answer ?? { kind: "placed", orderId: `order_${request.columnId}`, orderNumber: "C-1" },
    );
  }
}

class RecordingDurable extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  publish(fact: DurableFact): Promise<void> {
    this.facts.push(fact);
    return Promise.resolve();
  }
}

function scene(answers: ConstructorParameters<typeof ScriptedPlacement>[0] = {}) {
  const columns = new InMemoryPlannedColumns();
  const clock = new FixedClock(NOW);
  const placement = new ScriptedPlacement(answers);
  const durable = new RecordingDurable();
  const check = new RecordingBasketCheck({
    SEIGLE: { closesAt: RYE_CLOSES },
    CRO: { closesAt: CRO_CLOSES },
  });
  const handler = new SweepPlannedColumnsHandler(
    columns,
    new ConversionSchedule(check),
    new PlannedColumnConversion(placement, columns, durable, new DirectUnitOfWork(), clock),
    clock,
  );
  return { columns, clock, placement, durable, handler };
}

/** Une colonne écrite (version 1), ses lignes, et son instant rangé. */
async function seed(
  columns: InMemoryPlannedColumns,
  id: string,
  skus: readonly string[],
  { inDays = 1, convertsAt = null as Date | null } = {},
): Promise<void> {
  const column = PlannedColumn.open(
    {
      id,
      buyerUserId: "user_1",
      companyId: "chalet",
      serviceDay: TODAY.plusDays(inDays),
      routing: {
        method: "pickup",
        deliveryAddress: null,
        pickupAddressId: "pickup_1",
        window: { start: "07:00", end: id },
      },
    },
    TODAY,
  );
  column.replaceLines(
    skus.map((sku) => PlannedLine.create(sku, 10)),
    { now: NOW, today: TODAY },
  );
  column.scheduleConversion(convertsAt);
  await columns.save(column, NOW);
}

describe("SweepPlannedColumnsHandler", () => {
  it("convertit la colonne dont la première fermeture est dans moins de quinze minutes", async () => {
    const { columns, handler, placement } = scene();
    await seed(columns, "rye", ["CRO", "SEIGLE"]);
    expect(await handler.execute()).toMatchObject({ due: 1, placed: 1 });
    expect(placement.asked[0]).toMatchObject({ columnId: "rye", companyId: "chalet" });
    expect(columns.rows.get("rye")?.snapshot()).toMatchObject({
      status: "placed",
      orderId: "order_rye",
    });
  });

  it("repousse sans convertir une colonne qui ferme demain, et range son instant", async () => {
    const { columns, handler, placement } = scene();
    await seed(columns, "cro", ["CRO"]);
    expect(await handler.execute()).toMatchObject({ placed: 0, rescheduled: 1 });
    expect(placement.asked).toEqual([]);
    expect(columns.rows.get("cro")?.convertsAt).toEqual(new Date("2026-12-02T11:45:00.000Z"));
    expect(await handler.execute()).toMatchObject({ rescheduled: 0 });
  });

  it("rejoué, ne repasse pas une colonne convertie", async () => {
    const { columns, handler, placement } = scene();
    await seed(columns, "rye", ["SEIGLE"]);
    await handler.execute();
    expect(await handler.execute()).toMatchObject({ due: 0, placed: 0 });
    expect(placement.asked).toHaveLength(1);
  });

  it("un refus est inscrit, définitif, et son fait part pour la cloche", async () => {
    const { columns, handler, durable } = scene({
      SEIGLE: { kind: "refused", cause: "no_settlement", reason: "Pas de compte." },
    });
    await seed(columns, "rye", ["SEIGLE"]);
    expect(await handler.execute()).toMatchObject({ refused: 1 });
    expect(columns.rows.get("rye")?.snapshot()).toMatchObject({
      status: "refused",
      refusal: { cause: "no_settlement", reason: "Pas de compte." },
    });
    expect(durable.facts.map((fact) => fact.key)).toEqual(["recurring.planned_column_refused:rye"]);
  });

  it("une fermeture rangée passée sans conversion : manquée, jamais présentée", async () => {
    const { columns, handler, placement, durable } = scene();
    await seed(columns, "late", ["CRO"], { convertsAt: new Date("2026-12-01T07:40:00.000Z") });
    expect(await handler.execute()).toMatchObject({ missed: 1, placed: 0 });
    expect(placement.asked).toEqual([]);
    expect(columns.rows.get("late")?.snapshot().status).toBe("missed");
    expect(durable.facts.map((fact) => fact.type)).toEqual(["recurring.planned_column_missed"]);
  });

  it("une colonne vide reste brouillon : ni présentée, ni alertée", async () => {
    const { columns, handler, placement, durable } = scene();
    await seed(columns, "empty", []);
    expect(await handler.execute()).toMatchObject({ due: 0 });
    expect(placement.asked).toEqual([]);
    expect(durable.facts).toEqual([]);
    expect(columns.rows.get("empty")?.snapshot().status).toBe("draft");
  });

  it("ne lit pas au-delà d'après-demain une colonne dont l'instant n'est pas atteint", async () => {
    const { columns, handler } = scene();
    await seed(columns, "far", ["SEIGLE"], { inDays: 3 });
    expect(await handler.execute()).toMatchObject({ due: 0 });
  });

  /**
   * Régression : la fenêtre « servi au plus tard après-demain » laissait
   * passer un article qui ferme plus de deux jours avant le jour servi.
   */
  it("lit au-delà d'après-demain une colonne dont l'instant rangé est atteint, et la convertit", async () => {
    const { columns, handler, placement } = scene();
    await seed(columns, "far", ["SEIGLE"], {
      inDays: 5,
      convertsAt: new Date("2026-12-01T07:55:00.000Z"),
    });
    expect(await handler.execute()).toMatchObject({ due: 1, placed: 1 });
    expect(placement.asked[0]).toMatchObject({ columnId: "far" });
  });

  it("une erreur technique est comptée, la colonne reste brouillon pour le passage suivant", async () => {
    const { columns, handler } = scene({ SEIGLE: new Error("réseau") });
    await seed(columns, "rye", ["SEIGLE"]);
    expect(await handler.execute()).toMatchObject({ failed: 1, placed: 0 });
    expect(columns.rows.get("rye")?.snapshot().status).toBe("draft");
  });
});
