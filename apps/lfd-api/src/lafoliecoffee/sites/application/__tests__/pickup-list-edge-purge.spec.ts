import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { CreatePickupAddressCommand } from "../../../pickup-addresses/application/create-pickup-address.command.js";
import { CreatePickupAddressHandler } from "../../../pickup-addresses/application/create-pickup-address.handler.js";
import { RemovePickupAddressCommand } from "../../../pickup-addresses/application/remove-pickup-address.command.js";
import { RemovePickupAddressHandler } from "../../../pickup-addresses/application/remove-pickup-address.handler.js";
import { UpdatePickupAddressCommand } from "../../../pickup-addresses/application/update-pickup-address.command.js";
import { UpdatePickupAddressHandler } from "../../../pickup-addresses/application/update-pickup-address.handler.js";
import { PickupAddressNotFoundError } from "../../../pickup-addresses/domain/pickup-errors.js";
import { RecordingPublicSettingsEdgeCache } from "../../../shared/public-settings-cache/domain/__tests__/recording-public-settings-edge-cache.js";
import { SitePickupWithoutAudienceError } from "../../domain/site-errors.js";
import { SetSiteRolesCommand } from "../set-site-roles.command.js";
import { SetSiteRolesHandler } from "../set-site-roles.handler.js";
import {
  FixedDepartureSite,
  InMemorySites,
  InMemorySiteTables,
  PLACE,
  storedSite,
} from "./site-doubles.js";

const FIELDS = {
  label: "Laboratoire",
  ligne1: "18 rue des Archives",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
  opening: { publicOpening: null, proPickup: null },
} as const;

const ROLES = {
  pickup: true,
  supply: "on_site",
  deliveryDeparture: false,
  transferMode: "integrated",
  counterSetupMinutes: 0,
  eatIn: false,
} as const;

function scene() {
  const sites = new InMemorySites(storedSite("site_village", { place: { ...PLACE } }));
  const edge = new RecordingPublicSettingsEdgeCache();
  const afterCommit = new HeldAfterCommit();
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  return {
    edge,
    afterCommit,
    create: new CreatePickupAddressHandler(
      sites,
      new FixedIdGenerator(),
      events,
      uow,
      afterCommit,
      edge,
    ),
    update: new UpdatePickupAddressHandler(sites, events, uow, afterCommit, edge),
    remove: new RemovePickupAddressHandler(
      sites,
      new FixedClock(new Date(0)),
      events,
      uow,
      afterCommit,
      edge,
    ),
    roles: new SetSiteRolesHandler(
      sites,
      events,
      uow,
      new FixedDepartureSite(),
      new InMemorySiteTables(),
      afterCommit,
      edge,
    ),
  };
}

/**
 * `GET /pickup-addresses` est servie `public` par Workers Cache (2026-11-05,
 * étiquette `reglages-publics`) : chaque écriture validée d'un point — son
 * lieu, son archivage, ses clientèles — purge, et seulement après validation.
 */
describe("points de retrait — la purge de la liste publique", () => {
  it("une création purge après la validation, et pas avant", async () => {
    const { create, edge, afterCommit } = scene();
    await create.execute(
      new CreatePickupAddressCommand({ ...FIELDS, discounts: { b2b: null, b2c: null } }),
    );
    expect(edge.purges).toBe(0);
    await afterCommit.commit();
    expect(edge.purges).toBe(1);
  });

  it("une modification purge après la validation", async () => {
    const { update, edge, afterCommit } = scene();
    await update.execute(new UpdatePickupAddressCommand("site_village", { ...FIELDS }));
    expect(edge.purges).toBe(0);
    await afterCommit.commit();
    expect(edge.purges).toBe(1);
  });

  it("un archivage purge après la validation", async () => {
    const { remove, edge, afterCommit } = scene();
    await remove.execute(new RemovePickupAddressCommand("site_village"));
    await afterCommit.commit();
    expect(edge.purges).toBe(1);
  });

  it("les rôles d'un site (ses clientèles) purgent après la validation", async () => {
    const { roles, edge, afterCommit } = scene();
    await roles.execute(
      new SetSiteRolesCommand("site_village", {
        ...ROLES,
        pickupAudiences: { b2b: true, b2c: false },
      }),
    );
    expect(edge.purges).toBe(0);
    await afterCommit.commit();
    expect(edge.purges).toBe(1);
  });

  it("un refus ne purge rien — point inconnu, ou rôles refusés par l'agrégat", async () => {
    const { update, remove, roles, edge, afterCommit } = scene();
    await expect(
      update.execute(new UpdatePickupAddressCommand("site_absent", { ...FIELDS })),
    ).rejects.toBeInstanceOf(PickupAddressNotFoundError);
    await expect(
      remove.execute(new RemovePickupAddressCommand("site_absent")),
    ).rejects.toBeInstanceOf(PickupAddressNotFoundError);
    await expect(
      roles.execute(
        new SetSiteRolesCommand("site_village", {
          ...ROLES,
          pickupAudiences: { b2b: false, b2c: false },
        }),
      ),
    ).rejects.toBeInstanceOf(SitePickupWithoutAudienceError);
    await afterCommit.commit();
    expect(edge.purges).toBe(0);
  });
});
