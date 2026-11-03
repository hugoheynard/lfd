import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
} from "../../../../production/channels/delivery/index.js";
import type { RoundRow } from "../../../domain/ports/delivery-rounds.reader.js";
import { DeliveryDayReadiness } from "../../../domain/entities/delivery-day-readiness.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import { InMemoryDeliveryRounds, roundWith } from "../../commands/__tests__/round-doubles.js";
import { RoundsReaderOver } from "../../commands/__tests__/routing-doubles.js";
import { ScriptedPlanHold } from "../../__tests__/plan-hold-doubles.js";
import {
  attachmentOver,
  InMemoryInternalTransfers,
  RecordingTransferDayLock,
} from "../../__tests__/transfer-doubles.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { frozenResupply } from "../../__tests__/resupply-transfer-doubles.js";
import { ForgetReopenedPlan } from "../forget-reopened-plan.handler.js";
import { InMemoryDayReadiness, firsts } from "./day-readiness-doubles.js";

/** Instants recopiés et comparés entre eux seulement — exception étroite du §5. */
const CLOSED = new Date("2026-10-14T17:00:00.000Z");
const REOPENED = new Date("2026-10-14T19:00:00.000Z");
const NOW = new Date("2026-10-14T19:00:05.000Z");
const DAY = "2026-10-15";

/** Une lecture d'avant le départ : la tournée y est encore au dépôt. */
class StaleRoundsReader extends RoundsReaderOver {
  override async roundsOn(serviceDay: string): Promise<readonly RoundRow[]> {
    const rows = await super.roundsOn(serviceDay);
    return rows.map((row) => ({ ...row, departedAt: null }));
  }
}

function departed(round: DeliveryRound): DeliveryRound {
  return DeliveryRound.restore({ ...round.toSnapshot(), departedAt: CLOSED });
}

function setup(
  rounds: InMemoryDeliveryRounds,
  closed: readonly string[] = [],
  transfers = new InMemoryInternalTransfers(),
  options: { readonly reader?: RoundsReaderOver; readonly log?: string[] } = {},
) {
  const days = new InMemoryDayReadiness();
  const ready = DeliveryDayReadiness.start(DAY, CLOSED);
  ready.learnClosure(CLOSED, firsts("ord_1", "ord_2"), CLOSED);
  days.rows.set(DAY, {
    serviceDay: DAY,
    closedAt: ready.closedAt,
    shipments: ready.shipments,
    createdAt: ready.createdAt,
    updatedAt: ready.updatedAt,
  });
  const dayLock = new RecordingTransferDayLock(transfers);
  const attachment = attachmentOver(
    [],
    transfers,
    new RecordingPublisher(),
    [frozenResupply("res_1", DAY)],
    dayLock,
  );
  const handler = new ForgetReopenedPlan(
    new ScriptedPlanHold(closed.includes(DAY) ? "arrested" : "reopened", options.log),
    days,
    options.reader ?? new RoundsReaderOver(rounds),
    rounds,
    new FixedClock(NOW),
    attachment,
  );
  return { handler, days, attachment, dayLock };
}

function fact(orderIds: readonly string[], resupplyIds: readonly string[] = []) {
  return {
    eventId: "evt_1",
    type: PRODUCTION_DAY_REOPENED,
    payload: new ProductionDayReopenedEvent(
      DAY,
      REOPENED,
      CLOSED,
      orderIds,
      resupplyIds,
    ).durableFact().payload,
  };
}

describe("ForgetReopenedPlan", () => {
  it("oublie le plan arrêté et sort les commandes du plan des tournées au dépôt", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r1", DAY, "v1", ["ord_1", "ord_9"]));
    const { handler, days } = setup(rounds);

    await handler.handle(fact(["ord_1", "ord_2"]));

    expect(days.rows.get(DAY)).toMatchObject({ closedAt: null, shipments: firsts() });
    const [round] = rounds.all();
    expect(round?.orderIds).toEqual(["ord_9"]);
  });

  it("laisse une tournée partie telle quelle", async () => {
    const rounds = new InMemoryDeliveryRounds(departed(roundWith("r1", DAY, "v1", ["ord_1"])));
    const { handler } = setup(rounds);

    await handler.handle(fact(["ord_1"]));

    expect(rounds.all()[0]?.orderIds).toEqual(["ord_1"]);
    expect(rounds.saved).toEqual([]);
  });

  /**
   * Régression (audit final du réassort, 2026-11-03) : la tournée était jugée
   * sur une lecture sans verrou. Partie entre cette lecture et son chargement,
   * elle faisait lever « tournée partie » à `remove`, et l'abonné échouait à
   * chaque nouvel essai.
   */
  it("une tournée partie après la première lecture est laissée telle quelle, sans échec", async () => {
    const rounds = new InMemoryDeliveryRounds(departed(roundWith("r1", DAY, "v1", ["ord_1"])));
    const { handler } = setup(rounds, [], undefined, { reader: new StaleRoundsReader(rounds) });

    await handler.handle(fact(["ord_1"]));

    expect(rounds.all()[0]?.orderIds).toEqual(["ord_1"]);
    expect(rounds.saved).toEqual([]);
  });

  /**
   * Régression (audit final du réassort, 2026-11-03) : « de nouveau
   * arrêtée ? » se lisait sans verrou ; un réarrêt validé juste après voyait
   * ses tournées défaites.
   */
  it("tient le plan de la journée avant de défaire quoi que ce soit", async () => {
    const log: string[] = [];
    const rounds = new InMemoryDeliveryRounds(roundWith("r1", DAY, "v1", ["ord_1"]));
    const { handler, days } = setup(rounds, [], undefined, { log });

    await handler.handle(fact(["ord_1"]));

    expect(log).toEqual([`hold ${DAY}`]);
    expect(days.rows.get(DAY)?.closedAt).toBeNull();
  });

  it("ne défait rien quand la journée est de nouveau arrêtée (faits dans le désordre)", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r1", DAY, "v1", ["ord_1"]));
    const { handler, days } = setup(rounds, [DAY]);

    await handler.handle(fact(["ord_1"]));

    expect(days.rows.get(DAY)?.closedAt).toEqual(CLOSED);
    expect(rounds.saved).toEqual([]);
  });

  it("est idempotent : un rejeu ne retire rien de plus", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r1", DAY, "v1", ["ord_1"]));
    const { handler } = setup(rounds);

    await handler.handle(fact(["ord_1"]));
    await handler.handle(fact(["ord_1"]));

    expect(rounds.saved).toEqual(["r1"]);
  });

  /** R3c : le réassort n'est entré au transfert qu'à l'arrêt — il en sort à la réouverture. */
  it("sort du transfert prévu les réassorts du plan défait ; le transfert reste", async () => {
    const transfers = new InMemoryInternalTransfers();
    const { handler, attachment } = setup(new InMemoryDeliveryRounds(), [], transfers);
    await attachment.attachResupplies(DAY, ["res_1"]);

    await handler.handle(fact([], ["res_1"]));

    const [transfer] = transfers.all();
    expect(transfer?.resupplyIds).toEqual([]);
    expect(transfer?.status).toBe("planned");
  });

  /**
   * Régression (audit final du réassort, 2026-11-03) : la sortie d'un
   * réassort ne prenait pas le verrou des transferts du jour, que l'attache
   * d'un lancement « au plus tôt » prend.
   */
  it("prend le verrou des transferts du jour avant de sortir un réassort", async () => {
    const transfers = new InMemoryInternalTransfers();
    const { handler, attachment, dayLock } = setup(new InMemoryDeliveryRounds(), [], transfers);
    await attachment.attachResupplies(DAY, ["res_1"]);
    const savesBefore = transfers.saves.length;

    await handler.handle(fact([], ["res_1"]));

    expect(dayLock.held.at(-1)).toEqual({ days: [DAY], savesBefore });
  });

  it("ne sort aucun réassort quand la journée est de nouveau arrêtée", async () => {
    const transfers = new InMemoryInternalTransfers();
    const { handler, attachment } = setup(new InMemoryDeliveryRounds(), [DAY], transfers);
    await attachment.attachResupplies(DAY, ["res_1"]);

    await handler.handle(fact([], ["res_1"]));

    expect(transfers.all()[0]?.resupplyIds).toEqual(["res_1"]);
  });
});
