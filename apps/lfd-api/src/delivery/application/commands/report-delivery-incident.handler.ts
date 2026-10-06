import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryIncident, incidentPhotoKey } from "../../domain/entities/delivery-incident.js";
import { DriverRoundNotFoundError } from "../../domain/errors/delivery-driver-errors.js";
import {
  citeStopOrder,
  DeliveryIncidentReportedEvent,
} from "../../domain/events/delivery-doorstep.events.js";
import { DeliveryIncidentRepository } from "../../domain/ports/delivery-incident.repository.js";
import {
  DriverRoundsReader,
  type DriverRoundRow,
} from "../../domain/ports/driver-rounds.reader.js";
import { IncidentPhoto } from "../../domain/value-objects/incident-photo.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { StopDecisionOpening } from "../stop-decision-opening.js";
import { ReportDeliveryIncidentCommand } from "./report-delivery-incident.command.js";

const logger = new Logger("ReportDeliveryIncident");

/**
 * **« Déclarer un problème »** (`documentation/livraisons/a-la-porte.md`,
 * § 3, AP-Q4) — un fait daté, qui ne clôt rien et ne touche pas la commande.
 *
 * La tournée est lue SOUS LE MUR du livreur (le `roundOf` de sa page). Le
 * signalement naît dans le domaine, qui refuse ce qui ne va pas ensemble ;
 * la photo, s'il y en a une, est validée AVANT tout envoi.
 *
 * Le stockage d'abord, la ligne ensuite — même ordre que la photo de contrôle
 * qualité : une ligne qui promettrait un objet absent ferait échouer sa
 * lecture, alors qu'un objet sans ligne se retire ici même. Le bucket est
 * celui des pièces du fournil (`ProductionDocumentStore`) : opérationnel,
 * sans montant, gardé des semaines.
 *
 * Un problème « à la remise » qui dit que le client ne respecte pas les
 * conditions convenues OUVRE, dans la même unité, une décision du commercial
 * sur l'arrêt — et la notification des commerciaux part après la validation
 * (`StopDecisionOpening`, B3, B5). Quand la règle figée au départ répond
 * d'avance (B3 bis), la décision s'applique dans la même unité, sans
 * notification.
 *
 * @throws {DriverRoundNotFoundError} @throws {InvalidIncidentPhotoError}
 * @throws ceux de `DeliveryIncident.report`.
 */
@CommandHandler(ReportDeliveryIncidentCommand)
export class ReportDeliveryIncidentHandler implements ICommandHandler<
  ReportDeliveryIncidentCommand,
  string
> {
  constructor(
    private readonly rounds: DriverRoundsReader,
    private readonly incidents: DeliveryIncidentRepository,
    private readonly store: ProductionDocumentStore,
    private readonly directory: StaffAuthorDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly decisions: StopDecisionOpening,
  ) {}

  async execute(command: ReportDeliveryIncidentCommand): Promise<string> {
    const round = await this.rounds.roundOf(command.staffUserId, command.roundId);
    if (round === null) {
      throw new DriverRoundNotFoundError();
    }
    const photo = command.photo === null ? null : IncidentPhoto.create(command.photo);
    const id = this.ids.next();
    const incident = DeliveryIncident.report({
      id,
      round: {
        id: round.id,
        serviceDay: round.serviceDay,
        departed: round.departedAt !== null,
        returned: round.returnedAt !== null,
        stopIds: new Set(round.stops.map((stop) => stop.stopId)),
      },
      stopId: command.fields.stopId ?? null,
      family: command.fields.family,
      reason: command.fields.reason,
      note: command.fields.note,
      photoKey: photo === null ? null : incidentPhotoKey(round.id, id),
      at: this.clock.now(),
      author: await deliveryAuthorOf(this.directory, command.staffUserId),
    });
    const photoKey = incident.toSnapshot().photoKey;
    if (photo !== null && photoKey !== null) {
      await this.store.save(photoKey, { bytes: photo.bytes, contentType: photo.contentType });
    }
    await this.recordOrForget(round, incident, photoKey);
    return id;
  }

  /** La ligne et son fait, dans une transaction ; l'objet déjà rangé est retiré si elle échoue. */
  private async recordOrForget(
    round: DriverRoundRow,
    incident: DeliveryIncident,
    photoKey: string | null,
  ): Promise<void> {
    try {
      await this.uow.run(async () => {
        await this.incidents.record(incident);
        const settled = await this.decisions.openFor(
          incident,
          round,
          incident.toSnapshot().reportedAt,
        );
        await this.events.publishTraced(
          new DeliveryIncidentReportedEvent(
            {
              roundId: round.id,
              vehicleName: round.vehicleName,
              serviceDay: round.serviceDay,
              passage: round.passage,
            },
            incident,
            orderOf(round, incident.stopId),
          ),
        );
        // La décision réglée d'avance (B3 bis), après le signalement qui l'a déclenchée.
        if (settled !== null) {
          await this.events.publishTraced(settled);
        }
      });
    } catch (error) {
      if (photoKey !== null) {
        await this.store.delete(photoKey).catch((cause: unknown) => {
          logger.warn(
            `Photo du signalement ${incident.id} orpheline au stockage : ${String(cause)}`,
          );
        });
      }
      throw error;
    }
  }
}

/** La commande de l'arrêt signalé, citée par son numéro figé — `null` sans arrêt. */
function orderOf(
  round: DriverRoundRow,
  stopId: string | null,
): ReturnType<typeof citeStopOrder> | null {
  const stop = stopId === null ? undefined : round.stops.find((row) => row.stopId === stopId);
  return stop === undefined ? null : citeStopOrder(stop.orderId, stop.departed?.reference ?? "");
}
