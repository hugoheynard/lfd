import type { PlannedRoutingPayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { InMemoryGestureIntentLedger } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedStanding } from "../../../../occurrence/application/__tests__/recurring-doubles.js";
import {
  PlannedColumnNotFoundError,
  PlannedColumnFrozenError,
  PlannedColumnInPastError,
  PlannedColumnVersionConflictError,
  PlannedWindowTakenError,
  PlannerMembershipLostError,
  PlannerProOnlyError,
} from "../../../domain/errors/planned-column-errors.js";
import { PlannerWall } from "../../services/planner-wall.js";
import { InMemoryPlannedColumns } from "../../__tests__/planner-doubles.js";
import { OpenPlannedColumnCommand } from "../open-planned-column.command.js";
import { OpenPlannedColumnHandler } from "../open-planned-column.handler.js";
import { PutPlannedColumnCommand } from "../put-planned-column.command.js";
import { PutPlannedColumnHandler } from "../put-planned-column.handler.js";
import { WithdrawPlannedColumnCommand } from "../withdraw-planned-column.command.js";
import { WithdrawPlannedColumnHandler } from "../withdraw-planned-column.handler.js";

// Les jours ne sont comparés qu'à l'horloge doublée : « aujourd'hui » = 2026-12-01 à Paris.
const NOW = new Date("2026-12-01T08:00:00.000Z");
const DAY = "2026-12-03";
const MORNING: PlannedRoutingPayload = {
  method: "pickup",
  deliveryAddress: null,
  pickupAddressId: "pickup_1",
  window: { start: "07:00", end: "09:00" },
};
const NOON: PlannedRoutingPayload = { ...MORNING, window: { start: "11:00", end: "12:00" } };

function scene() {
  const columns = new InMemoryPlannedColumns();
  const wall = new PlannerWall(new FixedStanding(new Set(["user_1/chalet", "user_1/autre"])));
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  return {
    columns,
    open: new OpenPlannedColumnHandler(
      wall,
      columns,
      new OncePerIntent(new InMemoryGestureIntentLedger(), clock),
      uow,
      new FixedIdGenerator("col"),
      clock,
    ),
    put: new PutPlannedColumnHandler(wall, columns, uow, clock),
    withdraw: new WithdrawPlannedColumnHandler(wall, columns, uow, clock),
  };
}

let intents = 0;

const openCommand = (
  routing = MORNING,
  day = DAY,
  user = "user_1",
  company: string | null = "chalet",
  intentKey = `intent-${String((intents += 1))}`,
) => new OpenPlannedColumnCommand(user, company, { day, routing }, intentKey);

const putCommand = (id: string, version: number, quantity = 40, routing = MORNING) =>
  new PutPlannedColumnCommand("user_1", "chalet", id, {
    version,
    routing,
    lines: [{ sku: "CRO-01", quantity }],
  });

describe("OpenPlannedColumnHandler", () => {
  it("ouvre une colonne par créneau : deux créneaux du même jour font deux colonnes", async () => {
    const { open } = scene();
    const morning = await open.execute(openCommand(MORNING));
    const noon = await open.execute(openCommand(NOON));
    expect(morning).toEqual({ id: "col_000001", version: 1 });
    expect(noon.id).not.toBe(morning.id);
  });

  it("rejouée, rend la colonne déjà ouverte sans rien écrire", async () => {
    const { open, columns } = scene();
    const first = await open.execute(openCommand());
    const again = await open.execute(openCommand());
    expect(again).toEqual(first);
    expect(columns.saves).toBe(1);
  });

  it("la même intention rejouée rend la même colonne, même retirée entre-temps", async () => {
    const { open, withdraw } = scene();
    const first = await open.execute(openCommand(MORNING, DAY, "user_1", "chalet", "same"));
    await withdraw.execute(new WithdrawPlannedColumnCommand("user_1", "chalet", first.id));
    const replay = await open.execute(openCommand(MORNING, DAY, "user_1", "chalet", "same"));
    expect(replay).toEqual(first);
  });

  it("refuse l'espace personnel (403)", async () => {
    await expect(scene().open.execute(openCommand(MORNING, DAY, "user_1", null))).rejects.toThrow(
      PlannerProOnlyError,
    );
  });

  it("refuse une personne qui n'est pas membre de la société", async () => {
    await expect(scene().open.execute(openCommand(MORNING, DAY, "user_9"))).rejects.toThrow(
      PlannerMembershipLostError,
    );
  });

  it("refuse un jour passé", async () => {
    await expect(scene().open.execute(openCommand(MORNING, "2026-11-30"))).rejects.toThrow(
      PlannedColumnInPastError,
    );
  });
});

describe("PutPlannedColumnHandler", () => {
  it("écrit la colonne et monte sa version", async () => {
    const { open, put, columns } = scene();
    const { id } = await open.execute(openCommand());
    expect(await put.execute(putCommand(id, 1))).toEqual({ version: 2 });
    expect(columns.rows.get(id)?.snapshot().lines).toHaveLength(1);
  });

  it("rejouée avec l'ancienne version, ne refait rien et rend la version en place", async () => {
    const { open, put, columns } = scene();
    const { id } = await open.execute(openCommand());
    await put.execute(putCommand(id, 1));
    expect(await put.execute(putCommand(id, 1))).toEqual({ version: 2 });
    expect(columns.saves).toBe(2);
  });

  it("refuse un contenu différent sur une version périmée (deux onglets)", async () => {
    const { open, put } = scene();
    const { id } = await open.execute(openCommand());
    await put.execute(putCommand(id, 1, 40));
    await expect(put.execute(putCommand(id, 1, 12))).rejects.toThrow(
      PlannedColumnVersionConflictError,
    );
  });

  it("refuse de déplacer une colonne sur le créneau d'une autre", async () => {
    const { open, put } = scene();
    await open.execute(openCommand(MORNING));
    const noon = await open.execute(openCommand(NOON));
    await expect(put.execute(putCommand(noon.id, 1, 40, MORNING))).rejects.toThrow(
      PlannedWindowTakenError,
    );
  });

  it("ne trouve pas la colonne d'une autre société, même pour un membre des deux (404)", async () => {
    const { open, put } = scene();
    const { id } = await open.execute(openCommand());
    const fromOther = new PutPlannedColumnCommand("user_1", "autre", id, {
      version: 1,
      routing: MORNING,
      lines: [],
    });
    await expect(put.execute(fromOther)).rejects.toThrow(PlannedColumnNotFoundError);
  });

  it("refuse l'écriture d'une colonne gelée", async () => {
    const { open, put, columns } = scene();
    const { id } = await open.execute(openCommand());
    columns.rows.get(id)?.markPlaced("order_1");
    await expect(put.execute(putCommand(id, 1))).rejects.toThrow(PlannedColumnFrozenError);
  });
});

describe("WithdrawPlannedColumnHandler", () => {
  it("retire la colonne, libère son créneau, et ne refait rien au rejeu", async () => {
    const { open, withdraw, columns } = scene();
    const { id } = await open.execute(openCommand());
    await withdraw.execute(new WithdrawPlannedColumnCommand("user_1", "chalet", id));
    await withdraw.execute(new WithdrawPlannedColumnCommand("user_1", "chalet", id));
    expect(columns.saves).toBe(2);
    const reopened = await open.execute(openCommand());
    expect(reopened.id).not.toBe(id);
  });

  it("refuse d'écrire une colonne retirée (404)", async () => {
    const { open, withdraw, put } = scene();
    const { id } = await open.execute(openCommand());
    await withdraw.execute(new WithdrawPlannedColumnCommand("user_1", "chalet", id));
    await expect(put.execute(putCommand(id, 2))).rejects.toThrow(PlannedColumnNotFoundError);
  });
});
