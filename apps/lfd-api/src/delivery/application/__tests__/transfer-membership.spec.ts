import { RecordingPublisher } from "../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import type { TransferOrderRef } from "../../channels/commerce/index.js";
import { DeliveryDayReadiness } from "../../domain/entities/delivery-day-readiness.js";
import type { InternalTransfer } from "../../domain/entities/internal-transfer.js";
import {
  FixedDeliveryOrders,
  InMemoryDayReadiness,
  orderFact,
} from "../handlers/__tests__/day-readiness-doubles.js";
import { TransferAttachment } from "../transfer-attachment.js";
import { TransferMembership } from "../transfer-membership.js";
import {
  FixedTransferOrders,
  InMemoryInternalTransfers,
  plannedTransfer,
  RecordingTransferPlacer,
} from "./transfer-doubles.js";

/*
 * La place d'une commande dans les transferts (plan du transfert interne,
 * lot T2, décisions 3 et 4 de Hugo du 2026-10-13) : passée après la clôture,
 * elle entre ; annulée ou déplacée, elle sort tant que rien n'est parti.
 */

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const OTHER_DAY = "2030-03-13";
const AT = new Date(0);
const NOW = new Date(60_000);

function refOf(orderId: string, day = DAY): TransferOrderRef {
  return { orderId, day, siteId: "site_vv", siteLabel: "Val Village" };
}

function scene(options: {
  readonly refs: readonly TransferOrderRef[];
  readonly transfers?: readonly InternalTransfer[];
  readonly closedDays?: readonly string[];
}) {
  const transfers = new InMemoryInternalTransfers(...(options.transfers ?? []));
  const days = new InMemoryDayReadiness();
  for (const day of options.closedDays ?? []) {
    const readiness = DeliveryDayReadiness.start(day, AT);
    readiness.learnClosure(AT, [], AT);
    void days.save(readiness);
  }
  const orders = new FixedTransferOrders(options.refs);
  const events = new RecordingPublisher();
  const placer = new RecordingTransferPlacer();
  const clock = new FixedClock(NOW);
  const membership = new TransferMembership(
    orders,
    new FixedDeliveryOrders([orderFact("o_1"), orderFact("o_2")]),
    transfers,
    days,
    new TransferAttachment(orders, transfers, new FixedIdGenerator("tr"), clock, events),
    placer,
    clock,
    events,
  );
  return { membership, transfers, events, placer };
}

describe("TransferMembership.reconcile", () => {
  it("passée après la clôture : entre dans le transfert prévu de son site et de son jour", async () => {
    const { membership, transfers, placer } = scene({
      refs: [refOf("o_2")],
      transfers: [plannedTransfer("t_1", DAY, AT, ["o_1"])],
      closedDays: [DAY],
    });

    await membership.reconcile("o_2");

    expect(transfers.all()[0]?.orderIds).toEqual(["o_1", "o_2"]);
    expect(placer.soon).toEqual([DAY]);
  });

  it("le prévu est parti : un AUTRE transfert du même jour s'ouvre (Q-T3)", async () => {
    const gone = plannedTransfer("t_1", DAY, AT, ["o_1"]);
    gone.depart(AT, () => []);
    const { membership, transfers, events } = scene({
      refs: [refOf("o_2")],
      transfers: [gone],
      closedDays: [DAY],
    });

    await membership.reconcile("o_2");

    expect(transfers.all().map((t) => t.orderIds)).toEqual([["o_1"], ["o_2"]]);
    expect(events.factTypes()).toEqual(["internal_transfer.opened"]);
  });

  it("la journée n'est pas close : rien — la clôture s'en chargera", async () => {
    const { membership, transfers } = scene({ refs: [refOf("o_2")] });

    await membership.reconcile("o_2");

    expect(transfers.all()).toEqual([]);
  });

  it("annulée : sort du transfert prévu, et le journal le dit", async () => {
    const { membership, transfers, events } = scene({
      refs: [],
      transfers: [plannedTransfer("t_1", DAY, AT, ["o_1", "o_2"])],
      closedDays: [DAY],
    });

    await membership.reconcile("o_1");

    expect(transfers.all()[0]?.orderIds).toEqual(["o_2"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "internal_transfer.order_detached",
      payload: { order: { id: "o_1", name: "REF-o_1" }, cause: "cancelled" },
    });
  });

  it("changée de jour : sort de l'ancien transfert ; l'autre jour, pas clos, attend sa clôture", async () => {
    const { membership, transfers, events } = scene({
      refs: [refOf("o_1", OTHER_DAY)],
      transfers: [plannedTransfer("t_1", DAY, AT, ["o_1"])],
      closedDays: [DAY],
    });

    await membership.reconcile("o_1");

    expect(transfers.all().map((t) => t.orderIds)).toEqual([[]]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({ cause: "moved" });
  });

  it("annulée après le départ : rien ne bouge, une ligne au journal", async () => {
    const gone = plannedTransfer("t_1", DAY, AT, ["o_1"]);
    gone.depart(AT, () => []);
    const { membership, transfers, events } = scene({ refs: [], transfers: [gone] });

    await membership.reconcile("o_1");

    expect(transfers.all()[0]?.orderIds).toEqual(["o_1"]);
    expect(transfers.saves).toEqual([]);
    expect(events.factTypes()).toEqual(["internal_transfer.order_kept"]);
  });

  it("rejoué : à sa place, il ne fait rien", async () => {
    const { membership, transfers, events } = scene({
      refs: [refOf("o_1")],
      transfers: [plannedTransfer("t_1", DAY, AT, ["o_1"])],
      closedDays: [DAY],
    });

    await membership.reconcile("o_1");

    expect(transfers.saves).toEqual([]);
    expect(events.factTypes()).toEqual([]);
  });
});
