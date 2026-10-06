import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import type { DoorstepStopState } from "../../../domain/entities/doorstep-stop.js";
import { GesturePositionInvalidError } from "../../../domain/errors/gesture-position-errors.js";
import { CloseStopWithoutHandoverCommand } from "../close-stop-without-handover.command.js";
import { CloseStopWithoutHandoverHandler } from "../close-stop-without-handover.handler.js";
import { DeclareStopArrivalCommand } from "../declare-stop-arrival.command.js";
import { DeclareStopArrivalHandler } from "../declare-stop-arrival.handler.js";
import { FixedOrderStates, InMemoryDoorstepStops } from "./doorstep-doubles.js";
import { deliveryOn, FixedDeliveryOrders, InMemoryDeliveryRounds } from "./round-doubles.js";

/**
 * **La position au geste** (`documentation/livraisons/gps-y-aller-et-position.md`,
 * YA-D4) sur l'arrivée et la clôture sans remise — la remise et le dépôt sont
 * éprouvés dans leurs propres suites. Facultative, jamais bloquante ; refusée
 * seulement quand elle est impossible.
 */

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const DEPARTED = new Date(1_000);
const NOW = new Date(5_000);
const PAUL = "staff_paul";
const AT_DOOR = { positionLat: 45.46, positionLng: 6.9, positionAccuracyM: 12 };

function doorstep(): DoorstepStopState {
  return {
    stopId: "s_1",
    orderId: "o_1",
    round: { roundId: "r_1", vehicleName: "Kangoo", serviceDay: DAY, passage: 1 },
    departedAt: DEPARTED,
    returnedAt: null,
    reference: "CMD-1",
    closedAt: null,
    arrivedAt: null,
    signatureRequired: false,
    depositAllowed: false,
    decision: null,
  };
}

function arrival() {
  const stops = new InMemoryDoorstepStops(PAUL, doorstep());
  const handler = new DeclareStopArrivalHandler(
    stops,
    new FixedClock(NOW),
    new RecordingPublisher(),
    new DirectUnitOfWork(),
  );
  return { handler, stops };
}

function closing() {
  const rounds = new InMemoryDeliveryRounds(
    DeliveryRound.restore({
      id: "r_1",
      serviceDay: DAY,
      vehicleId: "v_1",
      vehicleName: "Kangoo",
      passage: 1,
      version: 2,
      departedAt: DEPARTED,
      driverStaffId: PAUL,
      createdAt: new Date(0),
      updatedAt: DEPARTED,
      stops: [{ id: "s_1", orderId: "o_1", position: 1, closedAt: null }],
    }),
  );
  const handler = new CloseStopWithoutHandoverHandler(
    rounds,
    new FixedOrderStates([{ orderId: "o_1", state: "cancelled", ready: false }]),
    new FixedDeliveryOrders([deliveryOn("o_1", DAY)]),
    new FixedClock(NOW),
    new RecordingPublisher(),
    new DirectUnitOfWork(),
  );
  const closedStop = () =>
    rounds
      .stored("r_1")
      ?.toSnapshot()
      .stops.find((stop) => stop.id === "s_1");
  return { handler, rounds, closedStop };
}

describe("« Je suis arrivé » — la position au geste", () => {
  it("écrit la position du téléphone avec l'arrivée", async () => {
    const { handler, stops } = arrival();

    await handler.execute(new DeclareStopArrivalCommand(PAUL, "r_1", "s_1", AT_DOOR));

    expect(stops.arrivedAt("s_1")).toEqual(NOW);
    expect(stops.arrivalPositions.get("s_1")).toMatchObject({ lat: 45.46, lng: 6.9 });
  });

  it("position indisponible : l'arrivée s'écrit quand même, sans position", async () => {
    const { handler, stops } = arrival();

    await handler.execute(new DeclareStopArrivalCommand(PAUL, "r_1", "s_1"));

    expect(stops.arrivedAt("s_1")).toEqual(NOW);
    expect(stops.arrivalPositions.get("s_1")).toBeNull();
  });

  it("une position impossible refuse le geste, sans rien écrire", async () => {
    const { handler, stops } = arrival();

    await expect(
      handler.execute(
        new DeclareStopArrivalCommand(PAUL, "r_1", "s_1", { ...AT_DOOR, positionLat: 95 }),
      ),
    ).rejects.toThrow(GesturePositionInvalidError);
    expect(stops.saves).toEqual([]);
  });
});

describe("Clore sans remise — la position au geste", () => {
  it("porte la position sur l'arrêt clos", async () => {
    const { handler, closedStop } = closing();

    await handler.execute(
      new CloseStopWithoutHandoverCommand(PAUL, "r_1", "s_1", { version: 2, ...AT_DOOR }),
    );

    expect(closedStop()?.closedPosition).toMatchObject({ lat: 45.46, lng: 6.9, accuracyM: 12 });
  });

  it("position indisponible : l'arrêt se clôt quand même", async () => {
    const { handler, rounds, closedStop } = closing();

    await handler.execute(new CloseStopWithoutHandoverCommand(PAUL, "r_1", "s_1", { version: 2 }));

    expect(rounds.stored("r_1")?.hasClosed("s_1")).toBe(true);
    expect(closedStop()).not.toHaveProperty("closedPosition");
  });
});
