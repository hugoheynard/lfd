import {
  ADDRESS_POINT_KINDS,
  type AddressPointKind,
  type BillingAddressPayload,
  type AddressPointSuggestionView,
  type GpsPoint,
} from "@lfd/contracts";

import type {
  DeliveryAddressPointsReader,
  DeliveryOrderAddress,
} from "../channels/commerce/index.js";
import type { GeocodeCacheReader } from "../domain/ports/geocode-cache.reader.js";
import type { GesturePositionsReader } from "../domain/ports/gesture-positions.reader.js";
import type { IgnoredAddressPointsReader } from "../domain/ports/ignored-address-points.reader.js";
import { addressKeyOf } from "../domain/services/address-key.js";
import {
  type AddressPointSuggestion,
  metersBetween,
  type PointObservation,
  referenceFor,
  suggestionFor,
} from "../domain/services/address-point-suggestions.js";
import { geocodeFreshSince } from "./delivery-routing-support.js";

/**
 * Jusqu'où le point qu'a vu le bureau peut s'écarter de celui recalculé au
 * moment d'appliquer ou d'ignorer : une livraison de plus dans le même groupe
 * déplace le centre de quelques mètres, pas la conclusion.
 */
export const SEEN_TOLERANCE_M = 10;

/** Les lectures dont le calcul a besoin — des ports, jamais leurs adaptateurs. */
export interface SuggestionPorts {
  readonly positions: GesturePositionsReader;
  readonly addresses: DeliveryAddressPointsReader;
  readonly ignored: IgnoredAddressPointsReader;
  readonly geocodes: GeocodeCacheReader;
}

/** Une suggestion, avec l'adresse du carnet qui la porte. */
export interface CurrentSuggestion extends AddressPointSuggestion {
  readonly address: Omit<DeliveryOrderAddress, "orderId">;
}

/**
 * **Les suggestions du moment** (`gps-y-aller-et-position.md`, §6) : les
 * positions gardées, rattachées à leur adresse du carnet par le commerce, puis
 * la règle du domaine pour chaque adresse et chaque genre. Partagé par la
 * lecture et les deux décisions, qui revérifient ce que le bureau a vu.
 *
 * Les plus solides d'abord : le plus de gestes concordants, puis le plus grand écart.
 */
export async function currentSuggestions(
  ports: SuggestionPorts,
  now: Date,
): Promise<readonly CurrentSuggestion[]> {
  const rows = await ports.positions.kept();
  const linked = await ports.addresses.addressesOfOrders([...new Set(rows.map((r) => r.orderId))]);
  const byOrder = new Map(linked.map((link) => [link.orderId, link]));
  const addresses = new Map(linked.map(({ orderId: _orderId, ...rest }) => [rest.addressId, rest]));
  const observations: PointObservation[] = rows.flatMap((row) => {
    const link = byOrder.get(row.orderId);
    return link === undefined ? [] : [{ addressId: link.addressId, ...row }];
  });
  const [ignored, geocoded] = await Promise.all([
    ports.ignored.ignored(),
    ports.geocodes.find(
      [...addresses.values()].filter((a) => a.door === null).map((a) => addressKeyOf(a.address)),
      geocodeFreshSince(now),
    ),
  ]);
  return [...addresses.values()]
    .flatMap((address) =>
      ADDRESS_POINT_KINDS.flatMap((kind) => {
        const reference = referenceFor(
          kind,
          address,
          geocoded.get(addressKeyOf(address.address)) ?? null,
        );
        const found = suggestionFor(address.addressId, kind, observations, reference, ignored);
        return found === null ? [] : [{ ...found, address }];
      }),
    )
    .sort((a, b) => b.concordant - a.concordant || (b.distanceM ?? 0) - (a.distanceM ?? 0));
}

/**
 * La suggestion que le bureau a vue, si elle tient encore : même adresse, même
 * genre, et un point à moins de {@link SEEN_TOLERANCE_M}. `null` sinon.
 */
export function seenSuggestion(
  suggestions: readonly CurrentSuggestion[],
  addressId: string,
  kind: AddressPointKind,
  seen: GpsPoint,
): CurrentSuggestion | null {
  return (
    suggestions.find(
      (s) =>
        s.addressId === addressId &&
        s.kind === kind &&
        metersBetween(s.suggested, seen) <= SEEN_TOLERANCE_M,
    ) ?? null
  );
}

/** Le modèle servi au bureau : un centre, une distance arrondie — aucune position de livreur. */
export function suggestionView(suggestion: CurrentSuggestion): AddressPointSuggestionView {
  return {
    addressId: suggestion.addressId,
    kind: suggestion.kind,
    customerLabel: suggestion.address.customerLabel,
    addressLabel: suggestion.address.addressLabel,
    addressText: addressTextOf(suggestion.address.address),
    suggested: { lat: suggestion.suggested.lat, lng: suggestion.suggested.lng },
    recorded:
      suggestion.reference.point === null
        ? null
        : { lat: suggestion.reference.point.lat, lng: suggestion.reference.point.lng },
    reference: suggestion.reference.source,
    distanceM: suggestion.distanceM === null ? null : Math.round(suggestion.distanceM),
    concordant: suggestion.concordant,
  };
}

/** L'adresse sur une ligne, sans les champs vides — comme la feuille de route. */
function addressTextOf(address: BillingAddressPayload): string {
  return [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(", ");
}
