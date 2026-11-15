import { instantToLocal } from "@lfd/contracts";

import { QualityCheck } from "../../../domain/entities/quality-check.js";
import { PlannedOrderLinesReader, ServiceDay } from "../../../../day/index.js";
import { BAGUETTE, CROISSANT } from "../../../../day/application/__tests__/closed-day-doubles.js";
import { CheckTable, InMemoryCheckReader } from "../../__tests__/quality-doubles.js";
import { CheckedQualityHoldsReader } from "../checked-quality-holds.reader.js";

/**
 * La retenue au retrait : la règle de la Supervision sur les contrôles de la
 * journée, et les lignes du plan lues au noyau seulement quand un blocage de
 * ligne est courant. Le jour est dérivé de maintenant.
 */
const NOW = new Date();
const DAY = ServiceDay.of(instantToLocal(NOW).day);

type PlannedLine = { readonly orderId: string; readonly sku: string };

/** Les lignes du plan en mémoire, filtrées comme la requête du noyau ; chaque appel est noté. */
class InMemoryPlannedLines extends PlannedOrderLinesReader {
  readonly calls: { readonly orderIds: readonly string[]; readonly skus: readonly string[] }[] = [];

  constructor(private readonly lines: readonly PlannedLine[]) {
    super();
  }

  linesOf(
    day: ServiceDay,
    orderIds: readonly string[],
    skus: readonly string[],
  ): Promise<readonly PlannedLine[]> {
    this.calls.push({ orderIds, skus });
    return Promise.resolve(
      day.equals(DAY)
        ? this.lines.filter((line) => orderIds.includes(line.orderId) && skus.includes(line.sku))
        : [],
    );
  }
}

function lineVerdict(table: CheckTable, id: string, sku: string, verdict: "ok" | "blocking") {
  table.rows.set(
    id,
    QualityCheck.render({
      id,
      serviceDay: DAY,
      target: { kind: "line", sku, quantitySeen: 4 },
      verdict,
      note: verdict === "ok" ? null : "Croûte pâle",
      checkedBy: "staff_sup",
      checkedAt: NOW,
      photos: [],
    }),
  );
}

const PLAN: readonly PlannedLine[] = [
  { orderId: "ord_a", sku: CROISSANT },
  { orderId: "ord_b", sku: BAGUETTE },
];

describe("CheckedQualityHoldsReader — la retenue servie au retrait", () => {
  it("retient les commandes qui portent un article bloqué, et elles seules", async () => {
    const checks = new CheckTable();
    lineVerdict(checks, "chk_1", CROISSANT, "blocking");
    const planned = new InMemoryPlannedLines(PLAN);
    const reader = new CheckedQualityHoldsReader(new InMemoryCheckReader(checks), planned);

    const held = await reader.heldOrders(DAY.value, ["ord_a", "ord_b"]);

    expect([...held]).toEqual(["ord_a"]);
    expect(planned.calls).toEqual([{ orderIds: ["ord_a", "ord_b"], skus: [CROISSANT] }]);
  });

  it("ne lit pas le plan quand aucun blocage de ligne n'est courant", async () => {
    const checks = new CheckTable();
    lineVerdict(checks, "chk_1", CROISSANT, "ok");
    const planned = new InMemoryPlannedLines(PLAN);
    const reader = new CheckedQualityHoldsReader(new InMemoryCheckReader(checks), planned);

    const held = await reader.heldOrders(DAY.value, ["ord_a", "ord_b"]);

    expect(held.size).toBe(0);
    expect(planned.calls).toEqual([]);
  });

  it("ne lit rien pour une liste de commandes vide", async () => {
    const planned = new InMemoryPlannedLines(PLAN);
    const reader = new CheckedQualityHoldsReader(
      new InMemoryCheckReader(new CheckTable()),
      planned,
    );

    expect((await reader.heldOrders(DAY.value, [])).size).toBe(0);
    expect(planned.calls).toEqual([]);
  });
});
