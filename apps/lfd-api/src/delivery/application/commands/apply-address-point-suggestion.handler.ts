import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import {
  DeliveryAddressPointCorrector,
  DeliveryAddressPointsReader,
} from "../../channels/commerce/index.js";
import { AddressSuggestionDecision } from "../../domain/entities/address-suggestion-decision.js";
import { AddressSuggestionChangedError } from "../../domain/errors/address-suggestion-errors.js";
import { AddressSuggestionDecisionRepository } from "../../domain/ports/address-suggestion-decision.repository.js";
import { GeocodeCacheReader } from "../../domain/ports/geocode-cache.reader.js";
import { GesturePositionsReader } from "../../domain/ports/gesture-positions.reader.js";
import { IgnoredAddressPointsReader } from "../../domain/ports/ignored-address-points.reader.js";
import { currentSuggestions, seenSuggestion } from "../address-point-suggestions-support.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { ApplyAddressPointSuggestionCommand } from "./apply-address-point-suggestion.command.js";

/**
 * **« Appliquer »** (`documentation/livraisons/gps-y-aller-et-position.md`,
 * §6) — le point que le bureau a VU devient la porte (le point GPS de
 * l'adresse, qui passe avant le géocodage) ou le stationnement.
 *
 * 1. La suggestion est recalculée : si elle n'existe plus, ou si son point
 *    s'est écarté de plus de `SEEN_TOLERANCE_M` de celui affiché, refus — on
 *    n'écrit pas un point que personne n'a regardé.
 * 2. Dans UNE unité : la livraison DEMANDE la correction au commerce
 *    (`DeliveryAddressPointCorrector`) — c'est le carnet qui décide, écrit et
 *    journalise `company.delivery_address_point_corrected` —, puis inscrit sa
 *    décision « appliquée ». Les deux partent ensemble, ou rien.
 *
 * Le livreur le voit à la tournée suivante : le départ fige le carnet.
 *
 * @sans-journal le fait est inscrit par le commerce, dans la même unité
 * (`company.delivery_address_point_corrected`) : un second fait pour le même
 * geste dirait deux fois la même chose ; la ligne de décision signe et date.
 *
 * @throws {AddressSuggestionChangedError} @throws {CompanyAddressNotFoundError}
 */
@CommandHandler(ApplyAddressPointSuggestionCommand)
export class ApplyAddressPointSuggestionHandler implements ICommandHandler<
  ApplyAddressPointSuggestionCommand,
  void
> {
  constructor(
    private readonly positions: GesturePositionsReader,
    private readonly addresses: DeliveryAddressPointsReader,
    private readonly ignored: IgnoredAddressPointsReader,
    private readonly geocodes: GeocodeCacheReader,
    private readonly corrector: DeliveryAddressPointCorrector,
    private readonly decisions: AddressSuggestionDecisionRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ApplyAddressPointSuggestionCommand): Promise<void> {
    const now = this.clock.now();
    const suggestions = await currentSuggestions(
      {
        positions: this.positions,
        addresses: this.addresses,
        ignored: this.ignored,
        geocodes: this.geocodes,
      },
      now,
    );
    const seen = seenSuggestion(suggestions, command.addressId, command.kind, command.seen);
    if (seen === null) {
      throw new AddressSuggestionChangedError();
    }
    const decision = AddressSuggestionDecision.apply({
      id: this.ids.next(),
      addressId: command.addressId,
      kind: command.kind,
      point: command.seen,
      at: now,
      author: await deliveryAuthorOf(this.directory, command.staffUserId),
    });
    await this.uow.run(async () => {
      await this.corrector.correct({
        companyId: seen.address.companyId,
        addressId: command.addressId,
        kind: command.kind,
        point: command.seen,
      });
      await this.decisions.record(decision);
    });
  }
}
