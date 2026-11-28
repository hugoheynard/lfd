import type { PlannedColumnView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedStanding } from "../../../../occurrence/application/__tests__/recurring-doubles.js";
import {
  PlannerClosedError,
  PlannerProOnlyError,
} from "../../../domain/errors/planned-column-errors.js";
import { PlannerWall } from "../../services/planner-wall.js";
import {
  FixedPlannedColumnsReader,
  FixedPlannerAccess,
  FixedFavoriteSkus,
  RecordingBasketCheck,
  type OwnedColumn,
} from "../../__tests__/planner-doubles.js";
import { GetPlannerHandler } from "../get-planner.handler.js";
import { GetPlannerQuery } from "../get-planner.query.js";

// « Aujourd'hui » est celui de l'horloge doublée : 2026-12-10 à Paris.
const NOW = new Date("2026-12-10T08:00:00.000Z");

function column(id: string, day: string, overrides: Partial<PlannedColumnView> = {}): OwnedColumn {
  return {
    companyId: "chalet",
    id,
    day,
    version: 1,
    status: "draft",
    routing: {
      method: "pickup",
      deliveryAddress: null,
      pickupAddressId: "pickup_1",
      window: { start: "07:00", end: "09:00" },
    },
    lines: [{ sku: "CRO-01", quantity: 40 }],
    convertsAt: null,
    orderId: null,
    refusal: null,
    ...overrides,
  };
}

function scene(columns: readonly OwnedColumn[], access = new FixedPlannerAccess()) {
  const favorites = new FixedFavoriteSkus({ chalet: ["BAG-01"], autre: ["AUTRE-01"] });
  const check = new RecordingBasketCheck();
  const reader = new FixedPlannedColumnsReader(columns);
  const handler = new GetPlannerHandler(
    new PlannerWall(new FixedStanding(new Set(["user_1/chalet"])), access),
    reader,
    favorites,
    check,
    new FixedClock(NOW),
  );
  return { handler, check, reader, favorites };
}

describe("GetPlannerHandler", () => {
  it("rend les colonnes groupées par jour, les favoris de la société, et l'horizon de 28 jours", async () => {
    const { handler, reader } = scene([
      column("a", "2026-12-12"),
      column("b", "2026-12-12", {
        routing: { ...column("x", "").routing, window: { start: "11:00", end: "12:00" } },
      }),
      column("c", "2026-12-14"),
    ]);
    const view = await handler.execute(new GetPlannerQuery("user_1", "chalet", "2026-12-11"));
    expect(view.lastPlannableDay).toBe("2027-01-07");
    expect(reader.asked[0]?.to.value).toBe("2027-01-07");
    expect(view.shownDays).toEqual(["2026-12-11", "2026-12-12", "2026-12-14"]);
    expect(view.days.map((day) => [day.day, day.columns.map((c) => c.id)])).toEqual([
      ["2026-12-12", ["a", "b"]],
      ["2026-12-14", ["c"]],
    ]);
    expect(view.favorites).toEqual(["BAG-01"]);
  });

  it("vérifie la grille en UNE question : lignes par colonne, favoris par jour", async () => {
    const { handler, check } = scene([column("a", "2026-12-12"), column("b", "2026-12-12")]);
    const view = await handler.execute(new GetPlannerQuery("user_1", "chalet", "2026-12-12"));
    expect(check.asked).toHaveLength(1);
    expect(check.asked[0]?.items).toEqual([
      { sku: "CRO-01", day: "2026-12-12", columnId: "a", quantity: 40 },
      { sku: "CRO-01", day: "2026-12-12", columnId: "b", quantity: 40 },
      { sku: "BAG-01", day: "2026-12-12", columnId: null, quantity: null },
    ]);
    expect(check.asked[0]?.buyerUserId).toBe("user_1");
    expect(view.checks).toHaveLength(3);
  });

  it("efface un brouillon d'un jour passé, garde une issue passée", async () => {
    const { handler } = scene([
      column("old-draft", "2026-12-08"),
      column("old-placed", "2026-12-08", { status: "placed", orderId: "order_1" }),
    ]);
    const view = await handler.execute(new GetPlannerQuery("user_1", "chalet", "2026-12-01"));
    expect(view.days.flatMap((day) => day.columns.map((c) => c.id))).toEqual(["old-placed"]);
    expect(view.shownDays).toEqual(["2026-12-10"]);
  });

  it("ne lit que les colonnes et les favoris de la société de l'espace", async () => {
    const { handler, favorites } = scene([
      column("theirs", "2026-12-12", {}),
      { ...column("other", "2026-12-12"), companyId: "autre" },
    ]);
    const view = await handler.execute(new GetPlannerQuery("user_1", "chalet", "2026-12-12"));
    expect(view.days.flatMap((day) => day.columns.map((c) => c.id))).toEqual(["theirs"]);
    expect(favorites.asked).toEqual(["chalet"]);
    expect(view.favorites).toEqual(["BAG-01"]);
  });

  it("refuse l'espace personnel (403)", async () => {
    const { handler } = scene([]);
    await expect(
      handler.execute(new GetPlannerQuery("user_1", null, "2026-12-12")),
    ).rejects.toThrow(PlannerProOnlyError);
  });

  it("refuse quand le planificateur est fermé à la personne (409), sans rien lire", async () => {
    const access = new FixedPlannerAccess(false);
    const { handler, reader } = scene([column("a", "2026-12-12")], access);
    await expect(
      handler.execute(new GetPlannerQuery("user_1", "chalet", "2026-12-12")),
    ).rejects.toThrow(PlannerClosedError);
    expect(access.asked).toEqual([{ companyId: "chalet" }]);
    expect(reader.asked).toEqual([]);
  });

  it("refuse l'espace personnel avant de juger la clé", async () => {
    const access = new FixedPlannerAccess(false);
    const { handler } = scene([], access);
    await expect(
      handler.execute(new GetPlannerQuery("user_1", null, "2026-12-12")),
    ).rejects.toThrow(PlannerProOnlyError);
    expect(access.asked).toEqual([]);
  });
});
