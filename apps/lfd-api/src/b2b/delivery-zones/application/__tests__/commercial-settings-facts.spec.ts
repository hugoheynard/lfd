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
import { CreateOrderCutoffCommand } from "../../../order-cutoffs/application/create-order-cutoff.command.js";
import { CreateOrderCutoffHandler } from "../../../order-cutoffs/application/create-order-cutoff.handler.js";
import { RemoveOrderCutoffCommand } from "../../../order-cutoffs/application/remove-order-cutoff.command.js";
import { RemoveOrderCutoffHandler } from "../../../order-cutoffs/application/remove-order-cutoff.handler.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import { SetDefaultPickupAddressCommand } from "../../../pickup-addresses/application/set-default-pickup-address.command.js";
import { SetDefaultPickupAddressHandler } from "../../../pickup-addresses/application/set-default-pickup-address.handler.js";
import { UpdatePickupAddressCommand } from "../../../pickup-addresses/application/update-pickup-address.command.js";
import { UpdatePickupAddressHandler } from "../../../pickup-addresses/application/update-pickup-address.handler.js";
import { DeliveryZoneRepository } from "../../domain/delivery-zone.repository.js";
import { CreateDeliveryZoneCommand } from "../create-delivery-zone.command.js";
import { CreateDeliveryZoneHandler } from "../create-delivery-zone.handler.js";
import { UpdateDeliveryZoneCommand } from "../update-delivery-zone.command.js";
import { UpdateDeliveryZoneHandler } from "../update-delivery-zone.handler.js";

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
  discountAudiences: { b2b: true, b2c: false },
  opening: { publicOpening: null, proPickup: null },
};

const CUTOFF: OrderCutoffPayload = {
  pickupAddressId: null,
  weekday: null,
  daysBefore: 1,
  time: "17:00",
  graceMinutes: 0,
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

/** Le point tel qu'il est en base avant la modification. */
const STORED_PICKUP: PickupAddressView = {
  ...PICKUP,
  id: "pickup_2",
  discountAudiences: { b2b: true, b2c: true },
};

function pickups(): PickupAddressRepository {
  return {
    list: () => Promise.resolve([] as readonly PickupAddressView[]),
    resolve: () => Promise.resolve(STORED_PICKUP),
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

  it("emporte la REMISE d'un point de retrait et ses clientèles — c'est la décision commerciale", async () => {
    const events = new RecordingPublisher();

    await new UpdatePickupAddressHandler(pickups(), events, new DirectUnitOfWork()).execute(
      new UpdatePickupAddressCommand("pickup_2", PICKUP),
    );

    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      ville: "Paris",
      discount: { bp: 500 },
      // « à qui » fait partie de la décision : 5 % pour les pros seulement
      // n'est pas 5 % pour tout le monde.
      discountAudiences: { b2b: true, b2c: false },
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
      graceMinutes: 0,
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
