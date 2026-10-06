import { DeliveryRound } from "../delivery-round.js";
import { GesturePosition } from "../../value-objects/gesture-position.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DEPARTED = new Date(1_000);
const CLOSED = new Date(2_000);
const AT_DOOR = GesturePosition.take({ lat: 45.46, lng: 6.9, accuracyM: 12 });

function departed(): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: "2030-03-12",
    vehicleId: "v_1",
    vehicleName: "Kangoo",
    passage: 1,
    version: 3,
    departedAt: DEPARTED,
    driverStaffId: "staff_paul",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    stops: [
      { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
      { id: "s_2", orderId: "o_2", position: 2, closedAt: CLOSED },
    ],
  });
}

/** La position au geste (`gps-y-aller-et-position.md`, YA-D4). */
describe("DeliveryRound.closeStop — la position au geste", () => {
  it("porte la position relevée sur l'arrêt que CE geste clôt", () => {
    const round = departed();

    round.closeStop("s_1", CLOSED, AT_DOOR);

    const closed = round.toSnapshot().stops.find((stop) => stop.id === "s_1");
    expect(closed?.closedPosition).toBe(AT_DOOR);
  });

  it("sans relevé, l'arrêt se clôt quand même, sans position à écrire", () => {
    const round = departed();

    round.closeStop("s_1", CLOSED);

    const closed = round.toSnapshot().stops.find((stop) => stop.id === "s_1");
    expect(closed?.closedAt).toBe(CLOSED);
    expect(closed).not.toHaveProperty("closedPosition");
  });

  it("un arrêt clos AVANT ce chargement ne porte aucune position : un save ne réécrit rien", () => {
    const round = departed();

    round.closeStop("s_1", CLOSED, AT_DOOR);

    const earlier = round.toSnapshot().stops.find((stop) => stop.id === "s_2");
    expect(earlier).not.toHaveProperty("closedPosition");
  });
});
