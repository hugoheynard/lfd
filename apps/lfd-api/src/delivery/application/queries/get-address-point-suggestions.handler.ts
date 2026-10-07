import { DepartureCandidatesReader } from "../../channels/commerce/index.js";
import { DepartureReader } from "../../domain/ports/departure.reader.js";
import type { AddressPointSuggestionsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { DeliveryAddressPointsReader } from "../../channels/commerce/index.js";
import { GeocodeCacheReader } from "../../domain/ports/geocode-cache.reader.js";
import { GesturePositionsReader } from "../../domain/ports/gesture-positions.reader.js";
import { IgnoredAddressPointsReader } from "../../domain/ports/ignored-address-points.reader.js";
import { MIN_CONCORDANT, MIN_GAP_M } from "../../domain/services/address-point-suggestions.js";
import { currentSuggestions, suggestionView } from "../address-point-suggestions-support.js";
import { GetAddressPointSuggestionsQuery } from "./get-address-point-suggestions.query.js";

/**
 * **« Carnet à corriger »** (`gps-y-aller-et-position.md`, §6) — les
 * portes et les stationnements que les gestes concordants situent loin du
 * point du carnet. Une lecture : elle n'écrit rien.
 *
 * Ce qui sort est un CENTRE de plusieurs gestes, jamais la position d'un
 * livreur, ni son nom, ni l'heure d'un geste.
 */
@QueryHandler(GetAddressPointSuggestionsQuery)
export class GetAddressPointSuggestionsHandler implements IQueryHandler<
  GetAddressPointSuggestionsQuery,
  AddressPointSuggestionsView
> {
  constructor(
    private readonly positions: GesturePositionsReader,
    private readonly addresses: DeliveryAddressPointsReader,
    private readonly ignored: IgnoredAddressPointsReader,
    private readonly geocodes: GeocodeCacheReader,
    private readonly departure: DepartureReader,
    private readonly candidates: DepartureCandidatesReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<AddressPointSuggestionsView> {
    const suggestions = await currentSuggestions(
      {
        positions: this.positions,
        addresses: this.addresses,
        ignored: this.ignored,
        geocodes: this.geocodes,
        departure: this.departure,
        candidates: this.candidates,
      },
      this.clock.now(),
    );
    return {
      suggestions: suggestions.map(suggestionView),
      minConcordant: MIN_CONCORDANT,
      minGapM: MIN_GAP_M,
    };
  }
}
