import type { VehicleView } from "@lfd/contracts";

import {
  dayContentsOver,
  MemoryDayContents,
  settleStore,
} from "../../../../platform/day-versions/__tests__/day-contents-doubles.js";
import { sources } from "../../../../platform/day-versions/__tests__/day-versions-doubles.js";
import { DayVersionRegistry } from "../../../../platform/day-versions/day-version-registry.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { FixedStaffPermissionHolders } from "../../../../staff/directory/domain/__tests__/fixed-staff-permission-holders.js";
import type { StaffPermissionHolder } from "../../../../staff/directory/domain/staff-permission-holders.js";
import type { BroughtBackOrderRow } from "../../../domain/ports/brought-back-orders.reader.js";
import {
  DeliveryIncidentsReader,
  type DeliveryIncidentRow,
} from "../../../domain/ports/delivery-incidents.reader.js";
import {
  DeliveryRoundsReader,
  type RoundRow,
} from "../../../domain/ports/delivery-rounds.reader.js";
import { FixedBroughtBackOrders } from "../../commands/__tests__/brought-back-doubles.js";
import { FixedOrderStates } from "../../commands/__tests__/doorstep-doubles.js";
import { deliveryOn, FixedDeliveryOrders } from "../../commands/__tests__/round-doubles.js";
import {
  FixedFleet,
  InMemoryRoutingSettings,
  vehicleView,
} from "../../commands/__tests__/routing-doubles.js";
import { DOORSTEP_PERMISSION, DRIVING_PERMISSION } from "../../delivery-driver-support.js";
import { RoundsDayLiveReading } from "../../rounds-day-live.service.js";
import { RoundsDayReading } from "../../rounds-day-reading.service.js";
import { GetDeliveryRoundsDayHandler } from "../get-delivery-rounds-day.handler.js";
import { GetDeliveryRoundsDayQuery } from "../get-delivery-rounds-day.query.js";
import { proposalCapacity } from "./capacity-doubles.js";

/**
 * L'écran Tournées servi depuis l'objet des journées
 * (`le-cache-du-back-office.md`, § 3.5) : la composition rangée sous
 * `delivery` et `orders`, livreurs, flotte, place et rapportées lus à chaque
 * appel. Les jours sont comparés entre eux, jamais à l'horloge.
 */

const DAY = "2030-03-12";
const DRIVER = "staff_driver";

const ROUND: RoundRow = {
  id: "r_1",
  vehicleId: "v_1",
  vehicleName: "Kangoo",
  passage: 1,
  version: 1,
  vehicleRetiredAt: null,
  departedAt: null,
  driverStaffId: DRIVER,
  returnedAt: null,
  planned: null,
  stops: [{ kind: "order", stopId: "s_1", orderId: "o_1", position: 1 }],
  transfers: new Map(),
};

/** Les tournées, chaque lecture notée dans le journal partagé. */
class LoggedRounds extends DeliveryRoundsReader {
  loads = 0;
  /** Les commandes placées dans une tournée vivante, de n'importe quel jour. */
  readonly placed = new Set(["o_1"]);

  constructor(private readonly log: string[]) {
    super();
  }

  roundsOn(): Promise<readonly RoundRow[]> {
    this.loads += 1;
    this.log.push("data");
    return Promise.resolve([ROUND]);
  }

  composedAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(orderIds.filter((id) => this.placed.has(id))));
  }
}

class NoIncidents extends DeliveryIncidentsReader {
  ofDay(): Promise<readonly DeliveryIncidentRow[]> {
    return Promise.resolve([]);
  }

  ofRounds(): Promise<readonly DeliveryIncidentRow[]> {
    return Promise.resolve([]);
  }
}

const holder = (staffUserId: string): StaffPermissionHolder => ({
  staffUserId,
  firstName: "Léa",
  lastName: "Livre",
});

function around() {
  const log: string[] = [];
  const journals = sources();
  for (const source of [journals.delivery, journals.orders]) {
    const versionOf = source.versionOf.bind(source);
    source.versionOf = (day: string) => {
      log.push(`version:${source.journal}`);
      return versionOf(day);
    };
  }
  const rounds = new LoggedRounds(log);
  const known = [
    deliveryOn("o_1", DAY),
    deliveryOn("o_2", DAY),
    deliveryOn("o_back", "2030-03-10"),
  ];
  const orders = new FixedDeliveryOrders(known);
  const permissions = new Map([
    [DRIVING_PERMISSION, [holder(DRIVER)]],
    [DOORSTEP_PERMISSION, [holder(DRIVER)]],
  ]);
  const vehicles: VehicleView[] = [vehicleView("v_1", "Kangoo")];
  const returned: BroughtBackOrderRow[] = [];
  const fleet = new FixedFleet(vehicles);
  const live = new RoundsDayLiveReading(
    rounds,
    new FixedStaffPermissionHolders(permissions),
    new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Léa", lastName: "Livre", staffUserId: DRIVER }, DRIVER),
    ),
    fleet,
    new InMemoryRoutingSettings(),
    proposalCapacity(fleet),
    new FixedBroughtBackOrders(returned),
    orders,
    new FixedOrderStates([{ orderId: "o_back", state: "open", ready: false }]),
  );
  const cache = new MemoryDayContents();
  const handler = new GetDeliveryRoundsDayHandler(
    new DayVersionRegistry(Object.values(journals)),
    dayContentsOver(cache),
    new RoundsDayReading(rounds, orders, new NoIncidents()),
    live,
  );
  const read = () => handler.execute(new GetDeliveryRoundsDayQuery(DAY));
  return { read, log, rounds, cache, journals, permissions, vehicles, returned, known };
}

describe("GetDeliveryRoundsDayHandler — l'objet des journées", () => {
  it("lit les numéros `delivery` et `orders` AVANT les tables", async () => {
    const { read, log } = around();

    await read();

    expect(log.indexOf("version:delivery")).toBeLessThan(log.indexOf("data"));
    expect(log.indexOf("version:orders")).toBeLessThan(log.indexOf("data"));
  });

  it("range la composition sous `rounds`, étiquetée par ses deux journaux", async () => {
    const { read, cache } = around();

    await read();
    await settleStore();

    expect(cache.stored).toEqual([{ screen: "rounds", day: DAY, tag: "delivery:3.orders:7" }]);
  });

  it("sert la composition rangée sans relire les tables", async () => {
    const { read, rounds } = around();
    const first = await read();
    await settleStore();

    const second = await read();

    expect(rounds.loads).toBe(1);
    expect(second).toEqual(first);
    expect(second.unassigned.map((order) => order.orderId)).toEqual(["o_2"]);
  });

  it.each(["delivery", "orders"] as const)("relit quand le numéro `%s` monte", async (journal) => {
    const { read, rounds, journals } = around();
    await read();
    await settleStore();

    journals[journal].version += 1;
    await read();

    expect(rounds.loads).toBe(2);
  });

  it("🔴 lit les droits du livreur à chaque appel : un droit retiré se voit sans numéro", async () => {
    const { read, rounds, permissions } = around();
    expect((await read()).rounds[0]?.driver).toEqual({
      staffUserId: DRIVER,
      name: "Léa Livre",
      canDrive: true,
    });
    await settleStore();

    permissions.set(DOORSTEP_PERMISSION, []);
    const view = await read();

    expect(rounds.loads).toBe(1);
    expect(view.rounds[0]?.driver?.canDrive).toBe(false);
  });

  it("🔴 lit la flotte à chaque appel : un véhicule retiré se voit sans numéro", async () => {
    const { read, rounds, vehicles } = around();
    expect((await read()).rounds[0]?.vehicleRetired).toBe(false);
    await settleStore();

    vehicles[0] = vehicleView("v_1", "Kangoo", "2030-03-01T08:00:00.000Z");
    const view = await read();

    expect(rounds.loads).toBe(1);
    expect(view.rounds[0]?.vehicleRetired).toBe(true);
  });

  it("lit la place au dépôt à chaque appel, sur la composition rangée", async () => {
    const { read } = around();
    await read();
    await settleStore();

    const view = await read();

    expect(view.rounds[0]?.place).not.toBeNull();
  });

  it("lit les commandes rapportées à chaque appel : une rapportée d'un autre jour passe en tête", async () => {
    const { read, rounds, returned } = around();
    await read();
    await settleStore();

    const back = new Date(Date.UTC(2030, 2, 10, 17));
    returned.push({ orderId: "o_back", broughtBackAt: back });
    const view = await read();

    expect(rounds.loads).toBe(1);
    expect(view.unassigned).toEqual([
      { orderId: "o_back", reference: "ORD-o_back", broughtBackAt: back.toISOString() },
      { orderId: "o_2", reference: "ORD-o_2" },
    ]);
  });

  it("🔴 lit l'état des composées à chaque appel : annulée sous le numéro d'un autre jour, servie juste", async () => {
    const { read, rounds, journals, known } = around();
    await read();
    await settleStore();
    const before = { delivery: journals.delivery.version, orders: journals.orders.version };

    // Composée ici, la commande appartient à un autre jour : son annulation
    // fait monter le numéro `orders` de CE jour-là, pas celui de l'écran.
    known[0] = deliveryOn("o_1", "2030-03-11", { status: "cancelled" });
    const view = await read();

    expect({ delivery: journals.delivery.version, orders: journals.orders.version }).toEqual(
      before,
    );
    expect(rounds.loads).toBe(1);
    expect(view.rounds[0]?.stops[0]?.signals).toEqual(["cancelled", "not_this_day"]);
  });

  it("🔴 lit les attendues déjà placées à chaque appel : placée dans une tournée d'un autre jour, plus « à répartir »", async () => {
    const { read, rounds } = around();
    expect((await read()).unassigned.map((order) => order.orderId)).toEqual(["o_2"]);
    await settleStore();

    rounds.placed.add("o_2");
    const view = await read();

    expect(rounds.loads).toBe(1);
    expect(view.unassigned).toEqual([]);
  });
});
