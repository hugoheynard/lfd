import { ReopenReleasePendingError } from "../../../domain/errors/reopen-release-errors.js";
import { FixedReopenRelease } from "../../../../channels/commerce/__tests__/reopen-release-doubles.js";
import { CloseProductionDayCommand } from "../close-production-day.command.js";
import {
  DAY,
  EARLIER,
  closeScene,
  openDay,
  order,
  reopenedBeforeTheColumn,
  reopenedDay,
} from "./close-production-day.scene.js";

/**
 * L'arrêt qui suit une réouverture attend que le commerce ait remis en
 * `placed` les commandes de l'arrêt défait (`plan-historique-des-tirages.md`,
 * § 5) : passé avant, il les laisserait hors de tout plan.
 */
describe("arrêter une journée rouverte", () => {
  it("refuse tant que la remise de l'arrêt défait est en attente, sans rien sauver", async () => {
    const releases = new FixedReopenRelease(true);
    const { handler, days, durable } = closeScene(reopenedDay(), [order()], { releases });

    await expect(handler.execute(new CloseProductionDayCommand(DAY))).rejects.toThrow(
      ReopenReleasePendingError,
    );

    expect(releases.asked).toEqual([{ day: DAY, undoneClosedAt: EARLIER }]);
    expect(days.saved).toBeNull();
    expect(durable.facts).toEqual([]);
  });

  it("le refus nomme le jour et dit de réessayer", async () => {
    const { handler } = closeScene(reopenedDay(), [order()], {
      releases: new FixedReopenRelease(true),
    });

    await expect(handler.execute(new CloseProductionDayCommand(DAY))).rejects.toThrow(
      `La réouverture du ${DAY} est encore en cours de remise au commerce : réessayez dans un instant.`,
    );
  });

  it("passe une fois la remise faite, et refige les commandes", async () => {
    const releases = new FixedReopenRelease(true);
    const { handler, days } = closeScene(reopenedDay(), [order(), order({ orderId: "ord_2" })], {
      releases,
    });
    await expect(handler.execute(new CloseProductionDayCommand(DAY))).rejects.toThrow(
      ReopenReleasePendingError,
    );

    releases.pending = false;
    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure.absorbed).toBe(2);
    expect(days.saved?.orders.map((frozen) => frozen.orderId)).toEqual(["ord_1", "ord_2"]);
  });

  it("l'arrêt automatique passe par le même refus", async () => {
    const { handler } = closeScene(reopenedDay(), [order()], {
      releases: new FixedReopenRelease(true),
    });

    await expect(handler.execute(new CloseProductionDayCommand(DAY, "automatic"))).rejects.toThrow(
      ReopenReleasePendingError,
    );
  });

  it("ne demande jamais rien au commerce sur une journée jamais rouverte", async () => {
    const releases = new FixedReopenRelease(true);
    const { handler } = closeScene(openDay(), [order()], { releases });

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure.absorbed).toBe(1);
    expect(releases.asked).toEqual([]);
  });

  it("ne demande rien quand la réouverture ne connaît pas l'arrêt défait (gardée avant)", async () => {
    const releases = new FixedReopenRelease(true);
    const { handler } = closeScene(reopenedBeforeTheColumn(), [order()], { releases });

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(releases.asked).toEqual([]);
  });
});
