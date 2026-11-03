import { PlanClosedBeforeOrderCutoffError } from "../../../domain/errors/production-errors.js";
import { FixedStatus } from "../../__tests__/plan-intake-doubles.js";
import { CutoffRules } from "../../__tests__/settings-doubles.js";
import { CloseProductionDayCommand } from "../close-production-day.command.js";
import { closedDay, closeScene, DAY, openDay, order } from "./close-production-day.scene.js";

/**
 * Pas d'arrêt avant l'heure limite générale (Hugo, 2026-10-21 —
 * `limites-de-commande/plan-une-seule-heure.md` §4 Q1, §5). `NOW` est 20:00 à
 * Paris, la veille de `DAY`.
 */
describe("l'arrêt avant l'heure limite générale", () => {
  const open = openDay;

  it("est refusé avant la fin du rattrapage, sans balayer ni écrire", async () => {
    const cutoffs = new CutoffRules([{ daysBefore: 1, time: "19:45", graceMinutes: 30 }]);
    const { handler, days, calls, durable } = closeScene(open(), [order()], { cutoffs });

    const refusal = handler.execute(new CloseProductionDayCommand(DAY, "manual", "staff-1"));

    await expect(refusal).rejects.toThrow(PlanClosedBeforeOrderCutoffError);
    await expect(refusal).rejects.toThrow(
      "Le plan du mardi 8 septembre s'arrête tout seul à l'heure limite générale, rattrapage compris : le lundi 7 septembre à 20:15.",
    );
    await expect(refusal).rejects.toThrow("Réglages › Commandes › Heure limite");
    expect(calls).toEqual([]);
    expect(days.saved).toBeNull();
    expect(durable.facts).toEqual([]);
  });

  it("passe à la fin du rattrapage pile", async () => {
    const cutoffs = new CutoffRules([{ daysBefore: 1, time: "19:30", graceMinutes: 30 }]);
    const { handler } = closeScene(open(), [order()], { cutoffs });

    const closure = await handler.execute(new CloseProductionDayCommand(DAY, "manual", "staff-1"));

    expect(closure.alreadyClosed).toBe(false);
  });

  it("passe sans heure limite posée : rien ne l'arrête seul", async () => {
    const { handler } = closeScene(open(), [order()]);

    expect((await handler.execute(new CloseProductionDayCommand(DAY))).alreadyClosed).toBe(false);
  });

  /** « Un arrêt déjà fait reste tel quel » : sa réannonce n'est pas un nouvel arrêt. */
  it("laisse réannoncer une journée déjà arrêtée, même avant l'heure limite", async () => {
    const cutoffs = new CutoffRules([{ daysBefore: 1, time: "23:00", graceMinutes: 0 }]);
    const { handler } = closeScene(closedDay(), [order()], { cutoffs });

    expect((await handler.execute(new CloseProductionDayCommand(DAY))).alreadyClosed).toBe(true);
  });
});

/**
 * Régression (audit final du réassort, 2026-11-03) : l'heure limite n'était
 * contrôlée que si l'en-tête lu HORS verrou disait « ouverte ». Une journée
 * vue arrêtée, puis rouverte pendant que l'arrêt attendait le verrou, se
 * trouvait ouverte sous lui — et s'arrêtait avant l'heure, sans refus. L'e2e
 * `production-day-close-race` rejoue la course sur le vrai Postgres.
 */
describe("l'arrêt d'une journée rouverte pendant qu'il attendait le verrou", () => {
  const cutoffs = () => new CutoffRules([{ daysBefore: 1, time: "23:00", graceMinutes: 0 }]);

  it("est refusé avant l'heure limite, même si l'en-tête lu avant le verrou disait arrêtée", async () => {
    const { handler, days, durable, events } = closeScene(openDay(), [order()], {
      cutoffs: cutoffs(),
      status: new FixedStatus(true),
    });

    await expect(handler.execute(new CloseProductionDayCommand(DAY))).rejects.toThrow(
      PlanClosedBeforeOrderCutoffError,
    );
    expect(days.saved).toBeNull();
    expect(durable.facts).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("réannonce sans refus si la journée est toujours arrêtée sous le verrou", async () => {
    const { handler } = closeScene(closedDay(), [order()], {
      cutoffs: cutoffs(),
      status: new FixedStatus(true),
    });

    expect((await handler.execute(new CloseProductionDayCommand(DAY))).alreadyClosed).toBe(true);
  });
});
