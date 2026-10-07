import { FixedDeparture } from "../commands/__tests__/routing-doubles.js";
import type { BillingAddressPayload, GpsPoint } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import {
  type StaffAuthor,
  StaffAuthorDirectory,
  StaffAuthors,
} from "../../../staff/directory/domain/staff-author-directory.js";
import {
  type DeliveryAddressPointCorrection,
  DeliveryAddressPointCorrector,
  DeliveryAddressPointsReader,
  type DeliveryOrderAddress,
} from "../../channels/commerce/index.js";
import type { AddressSuggestionDecision } from "../../domain/entities/address-suggestion-decision.js";
import { AddressSuggestionDecisionRepository } from "../../domain/ports/address-suggestion-decision.repository.js";
import { GeocodeCacheReader } from "../../domain/ports/geocode-cache.reader.js";
import {
  type GesturePositionRow,
  GesturePositionsReader,
} from "../../domain/ports/gesture-positions.reader.js";
import { IgnoredAddressPointsReader } from "../../domain/ports/ignored-address-points.reader.js";
import type { IgnoredPoint } from "../../domain/services/address-point-suggestions.js";
import type { GeoPoint } from "../../domain/value-objects/geo-point.js";

/**
 * Les doubles des suggestions de correction du carnet (§6) — des ports
 * hérités, jamais `jest.fn()`. Les instants ne sont comparés à rien : la
 * purge borne les positions en base, pas le calcul.
 */

/** Le point du carnet de l'Hôtel du Parc ; un degré de latitude ≈ 111 km. */
export const CARNET: GpsPoint = { lat: 45.565, lng: 5.918 };
export const north = (meters: number): GpsPoint => ({
  lat: CARNET.lat + meters / 111_195,
  lng: CARNET.lng,
});

const LINES: BillingAddressPayload = {
  label: "Hôtel du Parc",
  ligne1: "2 avenue du Parc",
  ligne2: "",
  codePostal: "73000",
  ville: "Chambéry",
  pays: "France",
};

/** Une commande livrée à l'Hôtel du Parc (`a1`, société `c1`). */
export function parcOrder(orderId: string, door: GpsPoint | null = CARNET): DeliveryOrderAddress {
  return {
    orderId,
    addressId: "a1",
    companyId: "c1",
    customerLabel: "Hôtel du Parc SAS",
    addressLabel: "Hôtel du Parc",
    address: LINES,
    door,
    parking: null,
  };
}

/** Une remise (`door`) ou une arrivée (`parking`) relevée sur cette commande. */
export function gesture(
  orderId: string,
  point: GpsPoint,
  kind: "door" | "parking" = "door",
): GesturePositionRow {
  return { orderId, kind, point, accuracyM: 8 };
}

export class FixedPositions extends GesturePositionsReader {
  constructor(readonly rows: GesturePositionRow[]) {
    super();
  }
  kept(): Promise<readonly GesturePositionRow[]> {
    return Promise.resolve(this.rows);
  }
}

/** Le carnet vu par la livraison : il suit les corrections du double ci-dessous. */
export class FixedAddressPoints extends DeliveryAddressPointsReader {
  constructor(public links: DeliveryOrderAddress[]) {
    super();
  }
  addressesOfOrders(orderIds: readonly string[]): Promise<readonly DeliveryOrderAddress[]> {
    return Promise.resolve(this.links.filter((link) => orderIds.includes(link.orderId)));
  }
}

/** Le commerce : il note la demande et corrige le carnet que le lecteur rend. */
export class RecordingCorrector extends DeliveryAddressPointCorrector {
  readonly corrections: DeliveryAddressPointCorrection[] = [];
  constructor(private readonly carnet: FixedAddressPoints) {
    super();
  }
  correct(correction: DeliveryAddressPointCorrection): Promise<void> {
    this.corrections.push(correction);
    this.carnet.links = this.carnet.links.map((link) =>
      link.addressId !== correction.addressId
        ? link
        : correction.kind === "door"
          ? { ...link, door: correction.point }
          : { ...link, parking: correction.point },
    );
    return Promise.resolve();
  }
}

/** Les décisions inscrites — et, ignorées, relues par le calcul suivant. */
export class InMemoryDecisions extends AddressSuggestionDecisionRepository {
  readonly recorded: AddressSuggestionDecision[] = [];
  record(decision: AddressSuggestionDecision): Promise<void> {
    this.recorded.push(decision);
    return Promise.resolve();
  }
}

export class DecisionsAsIgnored extends IgnoredAddressPointsReader {
  constructor(private readonly decisions: InMemoryDecisions) {
    super();
  }
  ignored(): Promise<readonly IgnoredPoint[]> {
    return Promise.resolve(
      this.decisions.recorded
        .map((decision) => decision.toSnapshot())
        .filter((state) => state.outcome === "ignored")
        .map((state) => ({ addressId: state.addressId, kind: state.kind, point: state.point })),
    );
  }
}

export class FixedGeocodes extends GeocodeCacheReader {
  constructor(private readonly points: ReadonlyMap<string, GeoPoint> = new Map()) {
    super();
  }
  find(): Promise<ReadonlyMap<string, GeoPoint>> {
    return Promise.resolve(this.points);
  }
}

export class OneDispatcher extends StaffAuthorDirectory {
  identify(): Promise<StaffAuthors> {
    const author: StaffAuthor = {
      staffUserId: "staff_ana",
      firstName: "Ana",
      lastName: "Martin",
      role: "logistique",
      roleLabel: "Logistique",
      jobTitle: "",
    };
    return Promise.resolve(new StaffAuthors(new Map([["staff_ana", author]])));
  }
}

/** Tout le bureau, branché sur un carnet et des positions. */
export function suggestionScene(
  links: DeliveryOrderAddress[],
  rows: GesturePositionRow[],
  depotGps: GeoPoint | null = null,
) {
  const carnet = new FixedAddressPoints(links);
  const decisions = new InMemoryDecisions();
  return {
    positions: new FixedPositions(rows),
    carnet,
    corrector: new RecordingCorrector(carnet),
    decisions,
    ignored: new DecisionsAsIgnored(decisions),
    geocodes: new FixedGeocodes(),
    /** Le dépôt ; non situé par défaut : aucune position n'est écartée. */
    depot: new FixedDeparture(depotGps),
    directory: new OneDispatcher(),
    ids: new FixedIdGenerator("decision"),
    clock: new FixedClock(new Date()),
    uow: new DirectUnitOfWork(),
  };
}
