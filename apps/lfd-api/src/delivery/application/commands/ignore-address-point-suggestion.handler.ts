import { DepartureCandidatesReader } from "../../channels/commerce/index.js";
import { DepartureReader } from "../../domain/ports/departure.reader.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { DeliveryAddressPointsReader } from "../../channels/commerce/index.js";
import { AddressSuggestionDecision } from "../../domain/entities/address-suggestion-decision.js";
import { AddressSuggestionChangedError } from "../../domain/errors/address-suggestion-errors.js";
import { AddressSuggestionDecisionRepository } from "../../domain/ports/address-suggestion-decision.repository.js";
import { GeocodeCacheReader } from "../../domain/ports/geocode-cache.reader.js";
import { GesturePositionsReader } from "../../domain/ports/gesture-positions.reader.js";
import { IgnoredAddressPointsReader } from "../../domain/ports/ignored-address-points.reader.js";
import { currentSuggestions, seenSuggestion } from "../address-point-suggestions-support.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { IgnoreAddressPointSuggestionCommand } from "./ignore-address-point-suggestion.command.js";

/**
 * **« Ignorer »** (`documentation/livraisons/gps-y-aller-et-position.md`,
 * §6) — le carnet ne change pas, et la suggestion n'est plus reproposée
 * tant que les livraisons concluent au même point (à `CLUSTER_RADIUS_M`
 * près). Un groupe ailleurs, né de nouvelles livraisons, reproposera.
 *
 * Même revérification que « Appliquer » : on n'ignore que ce qu'on a vu.
 *
 * @sans-journal ignorer n'écrit rien au carnet ni aux tournées ; la ligne de
 * décision est elle-même la trace — qui, quand, quel point — et le point
 * s'efface à 60 jours avec les positions dont il est tiré.
 *
 * @throws {AddressSuggestionChangedError}
 */
@CommandHandler(IgnoreAddressPointSuggestionCommand)
export class IgnoreAddressPointSuggestionHandler implements ICommandHandler<
  IgnoreAddressPointSuggestionCommand,
  void
> {
  constructor(
    private readonly positions: GesturePositionsReader,
    private readonly addresses: DeliveryAddressPointsReader,
    private readonly ignored: IgnoredAddressPointsReader,
    private readonly geocodes: GeocodeCacheReader,
    private readonly departure: DepartureReader,
    private readonly candidates: DepartureCandidatesReader,
    private readonly decisions: AddressSuggestionDecisionRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: IgnoreAddressPointSuggestionCommand): Promise<void> {
    const now = this.clock.now();
    const suggestions = await currentSuggestions(
      {
        positions: this.positions,
        addresses: this.addresses,
        ignored: this.ignored,
        geocodes: this.geocodes,
        departure: this.departure,
        candidates: this.candidates,
      },
      now,
    );
    const seen = seenSuggestion(suggestions, command.addressId, command.kind, command.seen);
    if (seen === null) {
      throw new AddressSuggestionChangedError();
    }
    const decision = AddressSuggestionDecision.ignore({
      id: this.ids.next(),
      addressId: command.addressId,
      kind: command.kind,
      point: command.seen,
      at: now,
      author: await deliveryAuthorOf(this.directory, command.staffUserId),
    });
    await this.uow.run(() => this.decisions.record(decision));
  }
}
