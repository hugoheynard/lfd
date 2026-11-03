import { NOTHING_PENDING, ProductionDay } from "../../../domain/entities/production-day.js";
import { CloseProductionDayCommand } from "../close-production-day.command.js";
import {
  closedFact,
  closeScene,
  DAY,
  EARLIER,
  listFact,
  NOW,
  openDay,
  order,
  VILLAGE_RESUPPLY,
} from "./close-production-day.scene.js";

describe("réannoncer une journée déjà close", () => {
  it("BALAIE quand même : une commande passée après la clôture meurt aussi (S4)", async () => {
    const closed = openDay();
    closed.close([order()], new Set<string>(), EARLIER, null);
    const { handler, sweeper } = closeScene(closed, [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(sweeper.days).toEqual([DAY]);
  });

  it("REPUBLIE le fait sans rien recalculer — l'instantané, pas le commerce d'aujourd'hui", async () => {
    // Le filet humain : presser à nouveau le bouton republie un fait durable.
    // Il porte les commandes de l'INSTANTANÉ (ord_1), jamais `ord_2` arrivée
    // après l'arrêt : le commerce n'absorbe que ce que le fournil a compté.
    const closed = openDay();
    closed.close([order()], new Set<string>(), EARLIER, null);
    const { handler, days, events, durable } = closeScene(closed, [
      order(),
      order({ orderId: "ord_2" }),
    ]);

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure.alreadyClosed).toBe(true);
    // L'instant du SNAPSHOT, jamais celui du rejeu : deux commandes absorbées
    // par la même clôture doivent porter la même heure.
    expect(closure.closedAt).toBe(EARLIER.toISOString());
    expect(closure.absorbed).toBe(1);
    expect(events.published).toEqual([]);
    // La liste est republiée sous la MÊME clé par commande, et datée du tirage
    // d'origine : la boîte d'envoi l'absorbe (colisage, §13, MINEURS).
    expect(durable.facts).toEqual([
      closedFact(["ord_1"], EARLIER, NOW),
      listFact(order(), EARLIER),
    ]);
    expect(days.saved).toBeNull();
  });

  it("une réannonce est un fait NEUF : sa clé porte l'instant du geste", async () => {
    // Dédupliquée sur la clé de la clôture, elle ne ferait rien — un bouton de
    // réparation sans effet. Cf. `ProductionDayClosedEvent`, « La clé ».
    const closed = openDay();
    closed.close([order()], new Set<string>(), EARLIER, null);
    const { handler, durable } = closeScene(closed, [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(durable.facts[0]?.key).toBe(
      `production.day_closed:${DAY}:${EARLIER.toISOString()}:reannounced:${NOW.toISOString()}`,
    );
  });

  it("n'écrit AUCUN fait au journal — rien n'a changé", async () => {
    // Un second « arrêtée » dirait une heure et un auteur qui n'ont rien arrêté.
    const closed = openDay();
    closed.close([order()], new Set<string>(), EARLIER, null);
    const { handler, events } = closeScene(closed, [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(events.traced).toEqual([]);
    expect(events.insideUnitOfWork).toEqual([]);
  });

  it("ne demande MÊME PAS les commandes au commerce", async () => {
    // Une requête de moins, et surtout aucun risque de croire qu'on a lu ce
    // qu'on va écrire : une journée close ne relit pas ce qui a changé depuis.
    const closed = openDay();
    closed.close([order()], new Set<string>(), EARLIER, null);
    const { handler, commerce } = closeScene(closed, [order()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(commerce.asked).toBe(0);
  });
});

/**
 * Régression (audit du réassort, 2026-11-02) : une journée qu'un lancement
 * « au plus tôt » a ouverte arrêtée n'a jamais publié `production.day_closed`
 * (Q6 : ni fait d'arrêt, ni dossier). L'arrêt suivant — à la main, ou le tour
 * automatique — la trouvait arrêtée et RÉANNONÇAIT un arrêt qui n'avait pas
 * eu lieu, au commerce et à la livraison.
 */
describe("une journée arrêtée par un lancement « au plus tôt »", () => {
  function openedByLaunch(): ProductionDay {
    const day = openDay();
    day.launchResupply(
      VILLAGE_RESUPPLY,
      { at: EARLIER, staffUserId: "staff-1", name: "Marie Dupont" },
      NOTHING_PENDING,
    );
    return day;
  }

  it("ne réannonce ni l'arrêt ni la liste à coliser, et rend « déjà arrêtée »", async () => {
    const { handler, durable, events } = closeScene(openedByLaunch(), [order()]);

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure).toMatchObject({ alreadyClosed: true, closedAt: EARLIER.toISOString() });
    expect(durable.facts).toEqual([]);
    expect(events.traced).toEqual([]);
  });
});
