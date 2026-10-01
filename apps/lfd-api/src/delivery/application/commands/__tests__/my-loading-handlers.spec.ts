import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { DriverRoundNotFoundError } from "../../../domain/errors/delivery-driver-errors.js";
import { FixedDriverWall } from "../../__tests__/driver-wall-doubles.js";
import { LoadDeliveryBinHandler } from "../load-delivery-bin.handler.js";
import { LoadMyBinCommand } from "../load-my-bin.command.js";
import { LoadMyBinHandler } from "../load-my-bin.handler.js";
import { UnloadDeliveryBinHandler } from "../unload-delivery-bin.handler.js";
import { UnloadMyBinCommand } from "../unload-my-bin.command.js";
import { UnloadMyBinHandler } from "../unload-my-bin.handler.js";
import { binOf, InMemoryBins, InMemoryStopLoadings, stopOf } from "./loading-doubles.js";
import { deliveryOn, FixedDeliveryOrders } from "./round-doubles.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);
const ORDERS = new FixedDeliveryOrders([deliveryOn("o_1", DAY)]);
/** `r_1` est à Paul ; `r_2` à Léa. */
const WALL = () =>
  new FixedDriverWall(
    new Map([
      ["r_1", "staff_paul"],
      ["r_2", "staff_lea"],
    ]),
  );

function loader(loadings: InMemoryStopLoadings, wall = WALL()) {
  const events = new RecordingPublisher();
  const inner = new LoadDeliveryBinHandler(
    new InMemoryBins(binOf("b_1", "o_1", "AAAAAA")),
    loadings,
    ORDERS,
    new FixedIdGenerator("load"),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { handler: new LoadMyBinHandler(wall, inner, new DirectUnitOfWork()), events };
}

describe("LoadMyBinHandler — charger depuis « Ma tournée » (PL1)", () => {
  it("charge le bac dans MA tournée, par le geste du chargement, le livreur pour auteur", async () => {
    const loadings = new InMemoryStopLoadings(stopOf("o_1"));
    const { handler, events } = loader(loadings);

    await handler.execute(new LoadMyBinCommand("staff_paul", "r_1", { binId: "b_1" }));

    expect(loadings.stored("o_1")?.loads[0]).toMatchObject({
      binId: "b_1",
      loadedBy: "staff_paul",
      loadedVia: "scan",
    });
    expect(events.traced[0]?.journalFact().type).toBe("delivery_bin.loaded");
  });

  it("🔴 la tournée d'un autre : 404, et rien n'est chargé ni tracé", async () => {
    const loadings = new InMemoryStopLoadings(stopOf("o_1"));
    const wall = WALL();
    const { handler, events } = loader(loadings, wall);

    await expect(
      handler.execute(new LoadMyBinCommand("staff_paul", "r_2", { binId: "b_1" })),
    ).rejects.toThrow(DriverRoundNotFoundError);
    expect(wall.asked).toEqual(["staff_paul:r_2"]);
    expect(loadings.saves).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("une tournée qui n'existe pas : le même 404, qui ne confirme rien", async () => {
    const { handler } = loader(new InMemoryStopLoadings(stopOf("o_1")));

    await expect(
      handler.execute(new LoadMyBinCommand("staff_paul", "r_inconnue", { code: "AAAAAA" })),
    ).rejects.toThrow(DriverRoundNotFoundError);
  });
});

describe("UnloadMyBinHandler — reprendre un scan (PL1)", () => {
  function unloader(wall = WALL()) {
    const loadings = new InMemoryStopLoadings(
      stopOf("o_1", {
        loads: [
          {
            id: "l_1",
            binId: "b_1",
            loadedAt: NOW,
            loadedBy: "staff_paul",
            loadedVia: "scan",
            createdAt: NOW,
          },
        ],
      }),
    );
    const inner = new UnloadDeliveryBinHandler(
      new InMemoryBins(binOf("b_1", "o_1", "AAAAAA")),
      loadings,
      ORDERS,
      new FixedStaffAuthorDirectory(
        authorsKnownAs(
          { firstName: "Paul", lastName: "Roux", staffUserId: "staff_paul" },
          "staff_paul",
        ),
      ),
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    );
    return { handler: new UnloadMyBinHandler(wall, inner, new DirectUnitOfWork()), loadings };
  }

  it("décharge un bac de MA tournée", async () => {
    const { handler, loadings } = unloader();

    await handler.execute(new UnloadMyBinCommand("staff_paul", "r_1", "b_1"));

    expect(loadings.stored("o_1")?.loads[0]).toMatchObject({ loadedAt: null, loadedBy: null });
  });

  it("🔴 la tournée d'un autre : 404, le chargement reste", async () => {
    const { handler, loadings } = unloader();

    await expect(
      handler.execute(new UnloadMyBinCommand("staff_lea", "r_1", "b_1")),
    ).rejects.toThrow(DriverRoundNotFoundError);
    expect(loadings.saves).toEqual([]);
  });
});
