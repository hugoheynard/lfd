import { Buffer } from "node:buffer";

import { instantToLocal } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { InMemoryGestureIntentLedger } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { pdfPages } from "../../../../../platform/pdf/__tests__/pdf-text.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { DayResupplies } from "../../../../channels/commerce/__tests__/day-resupplies-doubles.js";
import {
  orderLine,
  producibleOrder,
} from "../../../../channels/commerce/__tests__/producible-order.fixture.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../../channels/commerce/day-orders.reader.js";
import { InMemoryProductionStore } from "../../../../shared/print/application/__tests__/production-store-doubles.js";
import type { ProvisionalChoice } from "../../../domain/entities/provisional-print.js";
import {
  NothingChangedSinceRunError,
  ProvisionalPrintOfArrestedDayError,
  ProvisionalRunContendedError,
  ProvisionalRunUnknownError,
} from "../../../domain/errors/provisional-print-errors.js";
import { DOSSIER_PARTS } from "../../../domain/services/day-dossier-selection.js";
import {
  ArrestedOrNot,
  FixedWithdrawals,
  FixedCommerceVersion,
  InMemoryProvisionalLedger,
  InMemoryProvisionalReader,
  ProvisionalPrintTable,
  provisionalRenderer,
} from "../../__tests__/provisional-print-doubles.js";
import { LiveDossierContent } from "../../services/live-dossier-content.js";
import { ProvisionalPrintIntake } from "../../services/provisional-print-intake.js";
import { DrawProvisionalPrintCommand } from "../draw-provisional-print.command.js";
import { DrawProvisionalPrintHandler } from "../draw-provisional-print.handler.js";

/**
 * **Tirer une impression provisoire** : refusée une fois le plan arrêté,
 * numérotée par journée, rangée sous son numéro, une fois par intention, et
 * « depuis #N » sur les empreintes gardées. Le jour est dérivé de maintenant.
 */
const NOW = new Date();
const DAY = instantToLocal(NOW).day;
const ALL: ProvisionalChoice = {
  parts: new Set(DOSSIER_PARTS),
  groups: "all",
  orders: { kind: "all" },
};

function croissants(orderId: string, quantity: number): ProducibleOrder {
  return producibleOrder(orderId, { lines: [orderLine("VIE-001", quantity, "Croissant")] });
}

/** Le commerce, dont le test fait bouger les commandes entre deux tirages. */
class LiveOrders extends DayOrdersReader {
  constructor(public current: readonly ProducibleOrder[]) {
    super();
  }

  producibleFor(): Promise<readonly ProducibleOrder[]> {
    return Promise.resolve(this.current);
  }
}

function scene(options: { readonly closed?: boolean } = {}) {
  const table = new ProvisionalPrintTable();
  const ledger = new InMemoryProvisionalLedger(table);
  const store = new InMemoryProductionStore();
  const commerce = new LiveOrders([croissants("ord_1", 12), croissants("ord_2", 6)]);
  const intake = new ProvisionalPrintIntake(
    new ArrestedOrNot(options.closed ?? false),
    new LiveDossierContent(commerce, new FixedWithdrawals(), new DayResupplies()),
    new FixedCommerceVersion(7),
    new InMemoryProvisionalReader(table),
  );
  const handler = new DrawProvisionalPrintHandler(
    intake,
    provisionalRenderer(),
    ledger,
    store,
    new FixedIdGenerator("print"),
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    new OncePerIntent(new InMemoryGestureIntentLedger(), new FixedClock(NOW)),
  );
  let keys = 0;
  const draw = (choice: ProvisionalChoice = ALL, key?: string): Promise<string> => {
    keys += 1;
    return handler.execute(
      new DrawProvisionalPrintCommand(DAY, choice, "staff_1", key ?? `key-${String(keys)}`),
    );
  };
  return { draw, table, ledger, store, commerce };
}

function since(run: number): ProvisionalChoice {
  return { ...ALL, orders: { kind: "since", run } };
}

describe("DrawProvisionalPrintHandler", () => {
  it("refuse une journée arrêtée, en nommant le dossier figé", async () => {
    const { draw, table, store } = scene({ closed: true });
    await expect(draw()).rejects.toBeInstanceOf(ProvisionalPrintOfArrestedDayError);
    await expect(draw()).rejects.toThrow(/dossier figé/u);
    expect(table.rows).toHaveLength(0);
    expect(store.objects.size).toBe(0);
  });

  it("numérote par journée, range le PDF sous son numéro, et garde version et empreintes", async () => {
    const { draw, table, store } = scene();
    const first = await draw();
    const second = await draw();

    expect(table.rows.map((print) => [print.state.id, print.state.run])).toEqual([
      [first, 1],
      [second, 2],
    ]);
    const [print] = table.rows;
    expect(print?.state).toMatchObject({
      commerceVersion: 7,
      printedAt: NOW,
      printedBy: "staff_1",
    });
    expect([...(print?.state.orderFingerprints.keys() ?? [])]).toEqual(["ord_1", "ord_2"]);
    expect([...store.objects.keys()]).toEqual([
      `${DAY}/provisoire-1.pdf`,
      `${DAY}/provisoire-2.pdf`,
    ]);
    const pages = pdfPages(store.objects.get(`${DAY}/provisoire-2.pdf`)?.bytes ?? Buffer.from(""));
    expect(pages[0]).toContain(`#2 ${instantToLocal(NOW).time}`);
  });

  it("un double clic sous la même intention ne tire pas deux numéros", async () => {
    const { draw, table } = scene();
    const first = await draw(ALL, "same-key");
    await expect(draw(ALL, "same-key")).resolves.toBe(first);
    expect(table.rows).toHaveLength(1);
  });

  it("reprend au numéro suivant quand un autre tirage a pris le sien, et redessine", async () => {
    const { draw, table, ledger, store } = scene();
    ledger.stolen.add(1);
    const id = await draw();

    expect(ledger.trace).toEqual(["record:#1", "record:#2"]);
    expect(table.rows.find((print) => print.state.id === id)?.state.run).toBe(2);
    // Le fichier du numéro perdu n'est jamais écrit par le perdant.
    expect([...store.objects.keys()]).toEqual([`${DAY}/provisoire-2.pdf`]);
  });

  it("renonce, en le disant, quand aucun numéro ne se libère", async () => {
    const { draw, ledger } = scene();
    [1, 2, 3, 4, 5].forEach((run) => ledger.stolen.add(run));
    await expect(draw()).rejects.toBeInstanceOf(ProvisionalRunContendedError);
  });

  it("« depuis #N » n'imprime que les commandes nouvelles ou modifiées", async () => {
    const { draw, table, commerce } = scene();
    await draw();
    commerce.current = [croissants("ord_1", 12), croissants("ord_2", 8), croissants("ord_3", 4)];
    await draw(since(1));

    expect([...(table.rows[1]?.state.orderFingerprints.keys() ?? [])]).toEqual(["ord_2", "ord_3"]);
  });

  it("« depuis #N » refuse un tirage inconnu, et un tirage depuis lequel rien n'a bougé", async () => {
    const { draw } = scene();
    await expect(draw(since(9))).rejects.toBeInstanceOf(ProvisionalRunUnknownError);
    await draw();
    await expect(draw(since(1))).rejects.toBeInstanceOf(NothingChangedSinceRunError);
  });

  it("ne garde aucune empreinte quand les fiches de commande ne sont pas tirées", async () => {
    const { draw, table } = scene();
    await draw({ ...ALL, parts: new Set(["recap"]) });
    expect(table.rows[0]?.state.orderFingerprints.size).toBe(0);
  });
});
