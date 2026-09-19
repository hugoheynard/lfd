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
import { UpdateOrderCutoffCommand } from "../../../order-cutoffs/application/update-order-cutoff.command.js";
import { UpdateOrderCutoffHandler } from "../../../order-cutoffs/application/update-order-cutoff.handler.js";
import { RemovePickupAddressCommand } from "../../../pickup-addresses/application/remove-pickup-address.command.js";
import { RemovePickupAddressHandler } from "../../../pickup-addresses/application/remove-pickup-address.handler.js";
import { PickupAddressNotFoundError } from "../../../pickup-addresses/domain/pickup-errors.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import { SetDefaultPickupAddressCommand } from "../../../pickup-addresses/application/set-default-pickup-address.command.js";
import { SetDefaultPickupAddressHandler } from "../../../pickup-addresses/application/set-default-pickup-address.handler.js";
import { UpdatePickupAddressCommand } from "../../../pickup-addresses/application/update-pickup-address.command.js";
import { UpdatePickupAddressHandler } from "../../../pickup-addresses/application/update-pickup-address.handler.js";
import { DeliveryZoneNotFoundError } from "../../domain/delivery-zone-errors.js";
import { DeliveryZoneRepository } from "../../domain/delivery-zone.repository.js";
import { CreateDeliveryZoneCommand } from "../create-delivery-zone.command.js";
import { CreateDeliveryZoneHandler } from "../create-delivery-zone.handler.js";
import { RemoveDeliveryZoneCommand } from "../remove-delivery-zone.command.js";
import { RemoveDeliveryZoneHandler } from "../remove-delivery-zone.handler.js";
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

/** La zone telle qu'elle est en base ; `null` = aucune zone de cet id. */
function zones(stored: DeliveryZoneView | null = null): DeliveryZoneRepository {
  return {
    list: () => Promise.resolve([] as readonly DeliveryZoneView[]),
    findById: () => Promise.resolve(stored),
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

function pickups(stored: PickupAddressView | null = STORED_PICKUP): PickupAddressRepository {
  return {
    list: () => Promise.resolve([] as readonly PickupAddressView[]),
    resolve: () => Promise.resolve(stored),
    create: () => Promise.resolve("pickup_2"),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    setDefault: () => Promise.resolve(),
  };
}

/** La règle telle qu'elle est en base avant son retrait : le lundi, au laboratoire. */
const STORED_CUTOFF: OrderCutoffView = {
  ...CUTOFF,
  id: "cutoff_5",
  pickupAddressId: "pickup_2",
  pickupLabel: "Laboratoire",
  weekday: "mon",
};

function cutoffs(): OrderCutoffRepository {
  return {
    list: () => Promise.resolve([] as readonly OrderCutoffView[]),
    create: () => Promise.resolve("cutoff_5"),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(STORED_CUTOFF),
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
      subjectLabel: "Paris intra-muros",
      label: "Paris intra-muros",
      // Un COMPTE, sous un nom de compte : il s'appelait `postalPrefixes`
      // jusqu'au lot B du plan des phrases, un nom de liste.
      postalPrefixCount: 2,
      fee: { cents: 900 },
    });
  });

  it("garde le nom d'une zone supprimée — après, il n'y a plus rien à lire", async () => {
    const events = new RecordingPublisher();
    const stored: DeliveryZoneView = { ...ZONE, id: "zone_3" };

    await new RemoveDeliveryZoneHandler(zones(stored), events, new DirectUnitOfWork()).execute(
      new RemoveDeliveryZoneCommand("zone_3"),
    );

    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "delivery_zone.removed",
      subjectId: "zone_3",
      payload: { subjectLabel: "Paris intra-muros" },
    });
  });

  it("refuse de supprimer une zone inconnue, sans fait", async () => {
    const events = new RecordingPublisher();

    await expect(
      new RemoveDeliveryZoneHandler(zones(), events, new DirectUnitOfWork()).execute(
        new RemoveDeliveryZoneCommand("zone_absente"),
      ),
    ).rejects.toBeInstanceOf(DeliveryZoneNotFoundError);
    expect(events.traced).toHaveLength(0);
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
    expect(events.traced[0]?.journalFact().payload).toEqual({ subjectLabel: "Laboratoire" });
  });

  it("garde le nom d'un point retiré, et refuse un point inconnu sans fait", async () => {
    const events = new RecordingPublisher();

    await new RemovePickupAddressHandler(pickups(), events, new DirectUnitOfWork()).execute(
      new RemovePickupAddressCommand("pickup_2"),
    );
    await expect(
      new RemovePickupAddressHandler(pickups(null), events, new DirectUnitOfWork()).execute(
        new RemovePickupAddressCommand("pickup_absent"),
      ),
    ).rejects.toBeInstanceOf(PickupAddressNotFoundError);

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "pickup_address.removed",
        subjectType: "pickup_address",
        subjectId: "pickup_2",
        payload: { subjectLabel: "Laboratoire" },
      },
    ]);
  });

  it("emporte la règle d'heure limite ENTIÈRE — chaque champ change la réponse", async () => {
    const events = new RecordingPublisher();

    await new CreateOrderCutoffHandler(
      cutoffs(),
      pickups(),
      events,
      new DirectUnitOfWork(),
    ).execute(new CreateOrderCutoffCommand(CUTOFF));

    // `null` n'est pas une absence ici : c'est « la règle par défaut » et
    // « tous les jours ». Le journal doit pouvoir les relire.
    expect(events.traced[0]?.journalFact().payload).toEqual({
      pickupAddress: null,
      weekday: null,
      daysBefore: 1,
      time: "17:00",
      graceMinutes: 0,
    });
  });

  it("cite le point d'une règle AVEC son nom du moment (D5)", async () => {
    const events = new RecordingPublisher();

    await new UpdateOrderCutoffHandler(
      cutoffs(),
      pickups(),
      events,
      new DirectUnitOfWork(),
    ).execute(new UpdateOrderCutoffCommand("cutoff_5", { ...CUTOFF, pickupAddressId: "pickup_2" }));

    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      pickupAddress: { id: "pickup_2", name: "Laboratoire" },
    });
  });

  it("cite par son seul id un point que l'annuaire ne connaît plus — sans refuser la règle", async () => {
    const events = new RecordingPublisher();

    await new CreateOrderCutoffHandler(
      cutoffs(),
      pickups(null),
      events,
      new DirectUnitOfWork(),
    ).execute(new CreateOrderCutoffCommand({ ...CUTOFF, pickupAddressId: "pickup_disparu" }));

    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      pickupAddress: "pickup_disparu",
    });
  });

  /**
   * Régression : le retrait d'une règle n'emportait que son identifiant, et
   * « qu'est-ce que la règle disait ce jour-là » n'avait plus de réponse dès
   * qu'on l'avait retirée.
   */
  it("garde la règle ENTIÈRE d'un réglage supprimé, point nommé compris", async () => {
    const events = new RecordingPublisher();

    await new RemoveOrderCutoffHandler(
      cutoffs(),
      pickups(),
      events,
      new DirectUnitOfWork(),
    ).execute(new RemoveOrderCutoffCommand("cutoff_5"));

    const fact = events.traced[0]?.journalFact();
    expect(fact?.type).toBe("order_cutoff.removed");
    expect(fact?.subjectId).toBe("cutoff_5");
    expect(fact?.payload).toEqual({
      pickupAddress: { id: "pickup_2", name: "Laboratoire" },
      weekday: "mon",
      daysBefore: 1,
      time: "17:00",
      graceMinutes: 0,
    });
  });
});
