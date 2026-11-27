import { IsoDate } from "../../../../basket/domain/value-objects/iso-date.js";
import {
  InvalidPlannedRoutingError,
  PlannedColumnAlreadySettledError,
  PlannedColumnBeyondHorizonError,
  PlannedColumnFrozenError,
  PlannedColumnInPastError,
  PlannedColumnWithoutCompanyError,
} from "../../errors/planned-column-errors.js";
import { PlannedLine } from "../../value-objects/planned-line.js";
import {
  PLANNING_HORIZON_DAYS,
  PlannedColumn,
  type PlannedColumnMoment,
  type PlannedRouting,
} from "../planned-column.js";

// Les dates ne sont comparées qu'entre elles : l'agrégat reçoit son instant.
const TODAY = IsoDate.fromString("2026-12-01");
const NOW = new Date("2026-12-01T08:00:00.000Z");
const MOMENT: PlannedColumnMoment = { now: NOW, today: TODAY };

const PICKUP: PlannedRouting = {
  method: "pickup",
  deliveryAddress: null,
  pickupAddressId: "pickup_1",
  window: { start: "07:00", end: "09:00" },
};

function openOn(day: IsoDate = TODAY.plusDays(2), companyId = "company_1"): PlannedColumn {
  return PlannedColumn.open(
    {
      id: "col_1",
      buyerUserId: "user_1",
      companyId,
      serviceDay: day,
      routing: PICKUP,
    },
    TODAY,
  );
}

function frozenAt(convertsAt: Date): PlannedColumn {
  return PlannedColumn.reconstitute({ ...openOn().snapshot(), convertsAt, version: 3 });
}

describe("PlannedColumn.open", () => {
  it("ouvre une colonne vide, en brouillon, pas encore écrite", () => {
    const day = openOn();
    expect(day.snapshot()).toMatchObject({ status: "draft", lines: [], convertsAt: null });
    expect(day.isNew).toBe(true);
  });

  it("refuse un jour passé", () => {
    expect(() => openOn(TODAY.plusDays(-1))).toThrow(PlannedColumnInPastError);
  });

  it("admet aujourd'hui et le dernier jour de l'horizon, refuse le lendemain", () => {
    expect(() => openOn(TODAY)).not.toThrow();
    expect(() => openOn(TODAY.plusDays(PLANNING_HORIZON_DAYS))).not.toThrow();
    expect(() => openOn(TODAY.plusDays(PLANNING_HORIZON_DAYS + 1))).toThrow(
      PlannedColumnBeyondHorizonError,
    );
  });

  it("refuse une société absente", () => {
    expect(() => openOn(TODAY, " ")).toThrow(PlannedColumnWithoutCompanyError);
  });

  it("refuse une livraison sans adresse", () => {
    expect(() =>
      PlannedColumn.open(
        {
          id: "col_1",
          buyerUserId: "user_1",
          companyId: "company_1",
          serviceDay: TODAY,
          routing: { ...PICKUP, method: "delivery" },
        },
        TODAY,
      ),
    ).toThrow(InvalidPlannedRoutingError);
  });
});

describe("PlannedColumn — écrire", () => {
  it("remplace les lignes, et rend faux quand rien ne change", () => {
    const day = openOn();
    const lines = [PlannedLine.create("CRO-01", 40)];
    expect(day.replaceLines(lines, MOMENT)).toBe(true);
    expect(day.replaceLines([PlannedLine.create("CRO-01", 40)], MOMENT)).toBe(false);
  });

  it("change l'acheminement, et rend faux quand rien ne change", () => {
    const day = openOn();
    expect(day.reroute({ ...PICKUP }, MOMENT)).toBe(false);
    expect(day.reroute({ ...PICKUP, window: { start: null, end: "09:00" } }, MOMENT)).toBe(true);
  });

  it("refuse toute écriture à partir de l'instant de conversion", () => {
    const day = frozenAt(NOW);
    expect(() => day.replaceLines([], MOMENT)).toThrow(PlannedColumnFrozenError);
    expect(() => day.reroute(PICKUP, MOMENT)).toThrow(PlannedColumnFrozenError);
  });

  it("écrit encore une milliseconde avant l'instant de conversion", () => {
    const day = frozenAt(new Date(NOW.getTime() + 1));
    expect(day.replaceLines([PlannedLine.create("CRO-01", 1)], MOMENT)).toBe(true);
  });

  it("refuse l'écriture d'une colonne dont le jour est passé", () => {
    const day = openOn(TODAY);
    const tomorrow = { now: NOW, today: TODAY.plusDays(1) };
    expect(() => day.replaceLines([], tomorrow)).toThrow(PlannedColumnInPastError);
  });

  it("refuse l'écriture d'une colonne passée ou refusée", () => {
    const placed = openOn();
    placed.markPlaced("order_1");
    expect(() => placed.replaceLines([], MOMENT)).toThrow(PlannedColumnFrozenError);
    const refused = openOn();
    refused.markRefused({ cause: "deadline_closed", reason: "trop tard" });
    expect(() => refused.reroute(PICKUP, MOMENT)).toThrow(PlannedColumnFrozenError);
  });
});

describe("PlannedColumn — retirer et issues", () => {
  it("se retire une fois ; la seconde ne refait rien", () => {
    const day = openOn();
    expect(day.withdraw(MOMENT)).toBe(true);
    expect(day.isWithdrawn).toBe(true);
    expect(day.withdraw(MOMENT)).toBe(false);
  });

  it("ne se retire plus après le gel", () => {
    expect(() => frozenAt(NOW).withdraw(MOMENT)).toThrow(PlannedColumnFrozenError);
  });

  it("ne reçoit qu'une issue", () => {
    const day = openOn();
    day.markMissed();
    expect(() => day.markPlaced("order_1")).toThrow(PlannedColumnAlreadySettledError);
  });
});

describe("PlannedColumn.scheduleConversion — l'instant du gel", () => {
  const AT = new Date("2026-12-02T08:45:00.000Z");

  it("pose l'instant, puis ne change rien au même instant", () => {
    const column = openOn();
    expect(column.scheduleConversion(AT)).toBe(true);
    expect(column.convertsAt).toEqual(AT);
    expect(column.scheduleConversion(new Date(AT.getTime()))).toBe(false);
  });

  it("une fois l'instant atteint, la colonne refuse toute écriture du client", () => {
    const column = openOn();
    column.scheduleConversion(AT);
    expect(() =>
      column.replaceLines([PlannedLine.create("CRO", 4)], { ...MOMENT, now: AT }),
    ).toThrow(PlannedColumnFrozenError);
  });

  it("refuse une colonne qui a déjà son issue", () => {
    const column = openOn();
    column.markMissed();
    expect(() => column.scheduleConversion(AT)).toThrow(PlannedColumnAlreadySettledError);
  });
});
