import { DirectUnitOfWork } from "../../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { Backorder } from "../../../domain/entities/backorder.js";
import {
  BackorderClosedError,
  BackorderNotFoundError,
  BackorderOriginNotFoundError,
} from "../../../domain/errors/backorder-errors.js";
import { BackorderOriginNumberReader } from "../../../domain/ports/backorder-origin-number.reader.js";
import { BackorderLine } from "../../../domain/value-objects/backorder-line.js";
import { backorderAbandonmentScene } from "../../__tests__/backorder-abandonment-doubles.js";
import { AbandonBackorderCommand } from "../abandon-backorder.command.js";
import { AbandonBackorderHandler } from "../abandon-backorder.handler.js";

/**
 * **Abandonner un reliquat** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5) :
 * verrou, abandon par l'agrégat, écriture, fait — et le refus d'un reliquat
 * déjà fermé, sans rien écrire.
 */

/** Recopié dans l'écriture, jamais comparé à l'horloge. */
const NOW = new Date(0);
const STAFF = "fiche-marie";

class FixedOriginNumbers extends BackorderOriginNumberReader {
  constructor(
    private readonly numbers: Readonly<Record<string, string>>,
    private readonly trace: string[],
  ) {
    super();
  }

  numberOf(originOrderId: string): Promise<string | null> {
    this.trace.push("origin-number");
    return Promise.resolve(this.numbers[originOrderId] ?? null);
  }
}

function openBackorder(): Backorder {
  return Backorder.open({
    id: "bo_1",
    originOrderId: "ord_1",
    companyId: "co_1",
    buyerUserId: "usr_1",
    lines: [BackorderLine.of({ sku: "CRO", quantity: 4, saleUnit: "piece" })],
    openedAt: NOW,
  });
}

function scene(seeded: readonly Backorder[], numbers: Record<string, string> = { ord_1: "ORD-1" }) {
  const trace: string[] = [];
  const reliquat = backorderAbandonmentScene(seeded, NOW, trace);
  const handler = new AbandonBackorderHandler(
    reliquat.backorders,
    new FixedOriginNumbers(numbers, trace),
    reliquat.abandonment,
    new DirectUnitOfWork(),
  );
  return { handler, trace, ...reliquat };
}

const abandon = (id = "bo_1") => new AbandonBackorderCommand(STAFF, id);

describe("AbandonBackorderHandler", () => {
  it("verrouille, abandonne, écrit puis journalise `backorder.abandoned`", async () => {
    const { handler, trace, backorders, journal } = scene([openBackorder()]);

    await handler.execute(abandon());

    expect(trace).toEqual(["lock-backorder", "origin-number", "save-backorder"]);
    expect(backorders.stateOf("bo_1")).toMatchObject({
      state: "abandoned",
      closedAt: NOW,
      closedByStaffId: STAFF,
      convertedOrderId: null,
    });
    expect(journal.facts).toEqual([
      {
        type: "backorder.abandoned",
        subjectType: "order",
        subjectId: "ord_1",
        payload: { subjectLabel: "ORD-1" },
      },
    ]);
  });

  it("rejoué, refuse un reliquat déjà abandonné sans rien écrire", async () => {
    const { handler, backorders, journal } = scene([openBackorder()]);
    await handler.execute(abandon());

    await expect(handler.execute(abandon())).rejects.toBeInstanceOf(BackorderClosedError);
    expect(backorders.saved).toHaveLength(1);
    expect(journal.types()).toEqual(["backorder.abandoned"]);
  });

  it("refuse un reliquat transformé", async () => {
    const converted = openBackorder();
    converted.convert("ord_2", NOW, "fiche-paul");
    const { handler, backorders, journal } = scene([converted]);

    await expect(handler.execute(abandon())).rejects.toBeInstanceOf(BackorderClosedError);
    expect(backorders.saved).toEqual([]);
    expect(journal.types()).toEqual([]);
  });

  it("404 sur un reliquat inconnu", async () => {
    const { handler } = scene([]);

    await expect(handler.execute(abandon("bo_x"))).rejects.toBeInstanceOf(BackorderNotFoundError);
  });

  it("une origine introuvable est une panne nommée, rien d'écrit", async () => {
    const { handler, backorders } = scene([openBackorder()], {});

    await expect(handler.execute(abandon())).rejects.toBeInstanceOf(BackorderOriginNotFoundError);
    expect(backorders.saved).toEqual([]);
  });
});
