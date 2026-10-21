import type { DeliveryZonePayload, DeliveryZoneView, PickupAddressPayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { RemovePickupAddressCommand } from "../../../pickup-addresses/application/remove-pickup-address.command.js";
import { RemovePickupAddressHandler } from "../../../pickup-addresses/application/remove-pickup-address.handler.js";
import { PickupAddressNotFoundError } from "../../../pickup-addresses/domain/pickup-errors.js";
import { UpdatePickupAddressCommand } from "../../../pickup-addresses/application/update-pickup-address.command.js";
import { UpdatePickupAddressHandler } from "../../../pickup-addresses/application/update-pickup-address.handler.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { PickupDiscount } from "../../../pickup-addresses/domain/pickup-discount.js";
import {
  InMemorySites,
  PLACE,
  storedSite,
} from "../../../sites/application/__tests__/site-doubles.js";
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
  discount: { mode: "percent", bp: 500 },
  discountAudiences: { b2b: true, b2c: false },
  opening: { publicOpening: null, proPickup: null },
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

/** Le site « pickup_2 » en base, non archivé, à côté d'un autre. */
function sites(): InMemorySites {
  return new InMemorySites(
    storedSite("pickup_2", {
      place: { ...PLACE, discount: PickupDiscount.of(null, { b2b: true, b2c: true }) },
    }),
    storedSite("pickup_1"),
  );
}

/** Un instant quelconque : l'archivage le date, aucun test ne le compare à l'horloge. */
const NOW = new FixedClock(new Date(0));

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

    await new UpdatePickupAddressHandler(sites(), events, new DirectUnitOfWork()).execute(
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
   * Depuis le lot S1 des sites (2026-10-13), « supprimer » ARCHIVE : le fait
   * dit `archived`, et garde toujours le nom du point.
   */
  it("garde le nom d'un point archivé, et refuse un point inconnu sans fait", async () => {
    const events = new RecordingPublisher();
    const remove = (id: string): Promise<void> =>
      new RemovePickupAddressHandler(sites(), NOW, events, new DirectUnitOfWork()).execute(
        new RemovePickupAddressCommand(id),
      );

    await remove("pickup_2");
    await expect(remove("pickup_absent")).rejects.toBeInstanceOf(PickupAddressNotFoundError);

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "pickup_address.archived",
        subjectType: "pickup_address",
        subjectId: "pickup_2",
        payload: { subjectLabel: "Laboratoire" },
      },
    ]);
  });
});
