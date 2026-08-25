import type {
  DeliveryZonePayload,
  DeliveryZoneView,
  OrderCutoffPayload,
  OrderCutoffView,
  PickupAddressPayload,
  PickupAddressView,
} from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { OrderCutoffRepository } from "../../../order-cutoffs/domain/order-cutoff.repository.js";
import {
  CreateOrderCutoffCommand,
  RemoveOrderCutoffCommand,
} from "../../../order-cutoffs/application/order-cutoff.commands.js";
import {
  CreateOrderCutoffHandler,
  RemoveOrderCutoffHandler,
} from "../../../order-cutoffs/application/order-cutoff.handlers.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import {
  SetDefaultPickupAddressCommand,
  UpdatePickupAddressCommand,
} from "../../../pickup-addresses/application/pickup-address.commands.js";
import {
  SetDefaultPickupAddressHandler,
  UpdatePickupAddressHandler,
} from "../../../pickup-addresses/application/pickup-address.handlers.js";
import { DeliveryZoneRepository } from "../../domain/delivery-zone.repository.js";
import { CreateDeliveryZoneCommand, UpdateDeliveryZoneCommand } from "../delivery-zone.commands.js";
import { CreateDeliveryZoneHandler, UpdateDeliveryZoneHandler } from "../delivery-zone.handlers.js";

/**
 * **Les réglages qui décident du prix payé.**
 *
 * Une zone facture la livraison, un point de retrait la remise, une heure
 * limite décale une commande au lendemain. Aucun de ces trois gestes ne
 * laissait de trace : quand un client réclame, la seule question qui compte est
 * « qu'est-ce que la règle disait CE JOUR-LÀ, et qui l'avait posée » — et l'état
 * courant ne répond pas, puisqu'il a peut-être changé à cause de la
 * réclamation.
 *
 * Ce qu'on tient ici : le fait nommé, et une charge qui suffit à relire sans
 * rouvrir la base — mais qui ne recopie pas la base.
 */
const ZONE: DeliveryZonePayload = {
  label: "Paris intra-muros",
  postalPrefixes: ["750", "751"],
  fee: { mode: "amount", cents: 900 },
};

const PICKUP: PickupAddressPayload = {
  label: "Laboratoire",
  ligne1: "18 rue des Archives",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
  isDefault: false,
  discount: { mode: "percent", bp: 500 },
  opening: { publicOpening: null, proPickup: null },
};

const CUTOFF: OrderCutoffPayload = {
  pickupAddressId: null,
  weekday: null,
  daysBefore: 1,
  time: "17:00",
};

function zones(): DeliveryZoneRepository {
  return {
    list: () => Promise.resolve([] as readonly DeliveryZoneView[]),
    findById: () => Promise.resolve(null),
    resolveForPostalCode: () => Promise.resolve(null),
    create: () => Promise.resolve("zone_3"),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  };
}

function pickups(): PickupAddressRepository {
  return {
    list: () => Promise.resolve([] as readonly PickupAddressView[]),
    findById: () => Promise.resolve(null),
    findDefault: () => Promise.resolve(null),
    create: () => Promise.resolve("pickup_2"),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    setDefault: () => Promise.resolve(),
  };
}

function cutoffs(): OrderCutoffRepository {
  return {
    list: () => Promise.resolve([] as readonly OrderCutoffView[]),
    create: () => Promise.resolve("cutoff_5"),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  };
}

describe("Les réglages commerciaux au journal", () => {
  it("emporte le TARIF d'une zone, et le nombre de préfixes — jamais la liste", async () => {
    const events = new RecordingPublisher();

    const zoneId = await new CreateDeliveryZoneHandler(
      zones(),
      events,
      new DirectUnitOfWork(),
    ).execute(new CreateDeliveryZoneCommand(ZONE));

    expect(zoneId).toBe("zone_3");
    expect(events.factTypes()).toEqual(["delivery_zone.created"]);
    // Deux cents codes postaux dans un journal ne se relisent pas ; leur NOMBRE
    // dit si la zone a grossi, et le tarif est ce qu'on vient vérifier.
    expect(events.traced[0]?.journalFact().payload).toEqual({
      label: "Paris intra-muros",
      postalPrefixes: 2,
      fee: { cents: 900 },
    });
  });

  it("distingue la modification de la création — même zone, deux faits", async () => {
    const events = new RecordingPublisher();

    await new UpdateDeliveryZoneHandler(zones(), events, new DirectUnitOfWork()).execute(
      new UpdateDeliveryZoneCommand("zone_3", ZONE),
    );

    expect(events.factTypes()).toEqual(["delivery_zone.updated"]);
  });

  it("emporte la REMISE d'un point de retrait — c'est la décision commerciale", async () => {
    const events = new RecordingPublisher();

    await new UpdatePickupAddressHandler(pickups(), events, new DirectUnitOfWork()).execute(
      new UpdatePickupAddressCommand("pickup_2", PICKUP),
    );

    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      ville: "Paris",
      discount: { bp: 500 },
    });
  });

  /**
   * Le défaut n'est pas un détail : c'est le point où finit le colis de qui n'a
   * rien choisi. Un fait à lui, distinct de la modification.
   */
  it("nomme le changement de point par défaut", async () => {
    const events = new RecordingPublisher();

    await new SetDefaultPickupAddressHandler(pickups(), events, new DirectUnitOfWork()).execute(
      new SetDefaultPickupAddressCommand("pickup_2"),
    );

    expect(events.factTypes()).toEqual(["pickup_address.default_set"]);
  });

  it("emporte la règle d'heure limite ENTIÈRE — chaque champ change la réponse", async () => {
    const events = new RecordingPublisher();

    await new CreateOrderCutoffHandler(cutoffs(), events, new DirectUnitOfWork()).execute(
      new CreateOrderCutoffCommand(CUTOFF),
    );

    // `null` n'est pas une absence ici : c'est « la règle par défaut » et
    // « tous les jours ». Le journal doit pouvoir les relire.
    expect(events.traced[0]?.journalFact().payload).toEqual({
      pickupAddressId: null,
      weekday: null,
      daysBefore: 1,
      time: "17:00",
    });
  });

  it("ne garde que l'identifiant d'un réglage supprimé", async () => {
    const events = new RecordingPublisher();

    await new RemoveOrderCutoffHandler(cutoffs(), events, new DirectUnitOfWork()).execute(
      new RemoveOrderCutoffCommand("cutoff_5"),
    );

    const fact = events.traced[0]?.journalFact();
    expect(fact?.type).toBe("order_cutoff.removed");
    expect(fact?.subjectId).toBe("cutoff_5");
    // Ce que la règle disait vit dans le fait qui l'a créée, toujours au flux.
    expect(fact?.payload).toEqual({});
  });
});
