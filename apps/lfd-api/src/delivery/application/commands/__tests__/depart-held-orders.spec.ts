import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { DepartureOrderHeldError } from "../../../domain/errors/delivery-loading-errors.js";
import { DepartDeliveryRoundCommand } from "../depart-delivery-round.command.js";
import { DepartDeliveryRoundHandler } from "../depart-delivery-round.handler.js";
import {
  FixedDepartureHolds,
  InMemoryStopLoadings,
  RecordingDepartedStops,
  stopOf,
} from "./loading-doubles.js";
import {
  deliveryOn,
  FixedDeliveryOrders,
  InMemoryDeliveryRounds,
  roundWith,
} from "./round-doubles.js";
import { FixedDoorstepSettings } from "./decision-doubles.js";

/*
 * « Partir » du dépôt refuse une commande retenue au contrôle qualité
 * (a-la-porte.md, § 10 ter, BQ — LB-Q1 : une tournée partie ne se
 * contrôle plus). La porte du livreur est éprouvée dans
 * `depart-my-round.handler.spec.ts`.
 */

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);

function loaded(orderId: string, stopId: string, code: string) {
  return stopOf(orderId, {
    stopId,
    roundOrderIds: ["o_1", "o_2"],
    loads: [`b_${orderId}`].map((binId) => ({
      id: `l_${binId}`,
      binId,
      loadedAt: NOW,
      loadedBy: "staff_1",
      loadedVia: "scan" as const,
      createdAt: NOW,
    })),
    bins: [{ id: `b_${orderId}`, code, voided: false, partnerOrderId: null }],
  });
}

function depart(holds: FixedDepartureHolds) {
  const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1", "o_2"]));
  const departed = new RecordingDepartedStops();
  const events = new RecordingPublisher();
  const handler = new DepartDeliveryRoundHandler(
    rounds,
    new InMemoryStopLoadings(loaded("o_1", "r_1_s1", "AAAAAA"), loaded("o_2", "r_1_s2", "BBBBBB")),
    departed,
    new FixedDeliveryOrders([deliveryOn("o_1", DAY), deliveryOn("o_2", DAY)]),
    holds,
    new FixedDoorstepSettings(),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { handler, rounds, departed, events };
}

describe("DepartDeliveryRoundHandler — une commande retenue ne part pas (BQ)", () => {
  it("refuse en nommant l'arrêt retenu, sans rien figer ni tracer", async () => {
    const holds = new FixedDepartureHolds(["o_2"]);
    const { handler, rounds, departed, events } = depart(holds);

    const refused = handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 }));

    await expect(refused).rejects.toThrow(DepartureOrderHeldError);
    await expect(refused).rejects.toThrow(
      "« Véhicule v_1 » ne peut pas partir : l'arrêt CMD-o_2 (Maison o_2) est retenu au contrôle qualité. Levez la retenue à la Supervision, ou retirez l'arrêt de la tournée, puis partez.",
    );
    expect(rounds.stored("r_1")?.departedAt).toBeNull();
    expect(departed.recorded).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("demande au retrait les commandes de la tournée, et part quand aucune n'est retenue", async () => {
    const holds = new FixedDepartureHolds();
    const { handler, rounds } = depart(holds);

    await handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 }));

    expect(holds.asked).toEqual([["o_1", "o_2"]]);
    expect(rounds.stored("r_1")?.departedAt).toEqual(NOW);
  });
});
