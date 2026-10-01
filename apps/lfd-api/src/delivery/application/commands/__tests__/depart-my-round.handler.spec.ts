import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import {
  DriverRoundBlockedError,
  DriverRoundDepartedError,
  DriverRoundNotFoundError,
  DriverRoundNotReadyError,
  DriverRoundStaleError,
} from "../../../domain/errors/delivery-driver-errors.js";
import { DepartMyRoundCommand } from "../depart-my-round.command.js";
import { DepartMyRoundHandler } from "../depart-my-round.handler.js";
import {
  FixedDepartureHolds,
  InMemoryStopLoadings,
  RecordingDepartedStops,
  stopOf,
} from "./loading-doubles.js";
import {
  deliveryOn,
  InMemoryDeliveryRounds,
  LocatedDeliveryOrders,
  roundWith,
} from "./round-doubles.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);
const POINT = { lat: 45.92, lng: 6.87 };

const ORDERS = new LocatedDeliveryOrders(
  [deliveryOn("o_1", DAY, { customerLabel: "Refuge 1950" })],
  [
    {
      orderId: "o_1",
      reference: "CMD-o_1",
      gps: POINT,
      address: null,
      window: null,
      stopMinutes: null,
    },
  ],
);

/** Le chargement complet de `o_1` : ses deux bacs chargés. */
const LOADED = () =>
  stopOf("o_1", {
    loads: ["b_1", "b_2"].map((binId) => ({
      id: `l_${binId}`,
      binId,
      loadedAt: NOW,
      loadedBy: "staff_chargeur",
      loadedVia: "scan" as const,
      createdAt: NOW,
    })),
  });

function roundOf(driverStaffId: string | null, departedAt: Date | null = null): DeliveryRound {
  return DeliveryRound.restore({
    ...roundWith("r_1", DAY, "v_1", ["o_1"]).toSnapshot(),
    driverStaffId,
    departedAt,
  });
}

function departMine(
  round: DeliveryRound,
  loadings = new InMemoryStopLoadings(LOADED()),
  holds = new FixedDepartureHolds(),
) {
  const rounds = new InMemoryDeliveryRounds(round);
  const departed = new RecordingDepartedStops();
  const events = new RecordingPublisher();
  const handler = new DepartMyRoundHandler(
    rounds,
    loadings,
    departed,
    ORDERS,
    holds,
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { handler, rounds, departed, events };
}

describe("DepartMyRoundHandler — « Commencer ma tournée » (MT-D3 v2)", () => {
  it("le livreur affecté fait partir SA tournée : même départ, rang et point figés, tracé", async () => {
    const { handler, rounds, departed, events } = departMine(roundOf("staff_paul"));

    await handler.execute(new DepartMyRoundCommand("staff_paul", "r_1", { version: 1 }));

    expect(rounds.stored("r_1")?.departedAt).toEqual(NOW);
    expect(departed.recorded.map((stop) => [stop.stopId, stop.departureRank, stop.gps])).toEqual([
      ["r_1_s1", 1, POINT],
    ]);
    expect(events.traced[0]?.journalFact().type).toBe("delivery_round.departed");
  });

  it("la tournée d'un AUTRE livreur : introuvable — on ne confirme pas qu'elle existe", async () => {
    const { handler, rounds, departed } = departMine(roundOf("staff_lea"));

    await expect(
      handler.execute(new DepartMyRoundCommand("staff_paul", "r_1", { version: 1 })),
    ).rejects.toThrow(DriverRoundNotFoundError);
    expect(rounds.stored("r_1")?.departedAt).toBeNull();
    expect(departed.recorded).toEqual([]);
  });

  it("une tournée SANS livreur est introuvable pour tout livreur", async () => {
    const { handler } = departMine(roundOf(null));

    await expect(
      handler.execute(new DepartMyRoundCommand("staff_paul", "r_1", { version: 1 })),
    ).rejects.toThrow(DriverRoundNotFoundError);
  });

  it("un arrêt non chargé : la phrase du livreur nomme le client et dit d'appeler le dépôt", async () => {
    const { handler, departed } = departMine(
      roundOf("staff_paul"),
      new InMemoryStopLoadings(stopOf("o_1")),
    );

    const refused = handler.execute(new DepartMyRoundCommand("staff_paul", "r_1", { version: 1 }));

    await expect(refused).rejects.toThrow(DriverRoundNotReadyError);
    await expect(refused).rejects.toThrow(
      "Vous ne pouvez pas partir : un arrêt n'est pas chargé (Refuge 1950 (CMD-o_1)) — appelez le dépôt.",
    );
    expect(departed.recorded).toEqual([]);
  });

  it("une version périmée : « modifiée au dépôt — rechargez la page »", async () => {
    const { handler } = departMine(roundOf("staff_paul"));

    await expect(
      handler.execute(new DepartMyRoundCommand("staff_paul", "r_1", { version: 9 })),
    ).rejects.toThrow(DriverRoundStaleError);
  });

  it("déjà partie : la phrase du livreur, pas celle du dépôt", async () => {
    const { handler } = departMine(roundOf("staff_paul", NOW));

    await expect(
      handler.execute(new DepartMyRoundCommand("staff_paul", "r_1", { version: 1 })),
    ).rejects.toThrow(DriverRoundDepartedError);
  });

  it("une tournée vide : « appelez le dépôt »", async () => {
    const empty = DeliveryRound.restore({ ...roundOf("staff_paul").toSnapshot(), stops: [] });
    const { handler } = departMine(empty);

    await expect(
      handler.execute(new DepartMyRoundCommand("staff_paul", "r_1", { version: 1 })),
    ).rejects.toThrow(DriverRoundBlockedError);
  });

  it("une commande retenue au contrôle qualité : le livreur ne part pas, l'arrêt est nommé (BQ)", async () => {
    const { handler, rounds, departed, events } = departMine(
      roundOf("staff_paul"),
      new InMemoryStopLoadings(LOADED()),
      new FixedDepartureHolds(["o_1"]),
    );

    const refused = handler.execute(new DepartMyRoundCommand("staff_paul", "r_1", { version: 1 }));

    await expect(refused).rejects.toThrow(DriverRoundBlockedError);
    await expect(refused).rejects.toThrow(
      "Vous ne pouvez pas partir : l'arrêt CMD-o_1 (Refuge 1950) est retenu au contrôle qualité — appelez le dépôt.",
    );
    expect(rounds.stored("r_1")?.departedAt).toBeNull();
    expect(departed.recorded).toEqual([]);
    expect(events.traced).toEqual([]);
  });
});
