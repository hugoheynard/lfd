import type { PendingStopDecisionsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryIncidentsReader } from "../../domain/ports/delivery-incidents.reader.js";
import { PendingDecisionsReader } from "../../domain/ports/pending-decisions.reader.js";
import { deliveryIncidentView } from "../delivery-incident-view.js";
import { stopDecisionView } from "../stop-decision-view.js";
import { GetPendingStopDecisionsQuery } from "./get-pending-stop-decisions.query.js";

/**
 * **« À décider »** (`documentation/livraisons/livreur/a-la-porte.md`, B3) — les
 * arrêts signalés dont la décision attend, ou qu'un commercial a autorisés
 * (on peut encore rapporter tant que le livreur n'a pas déposé), sur une
 * tournée partie et non rentrée ; avec les signalements de L'ARRÊT. Une
 * lecture : elle n'écrit rien.
 */
@QueryHandler(GetPendingStopDecisionsQuery)
export class GetPendingStopDecisionsHandler implements IQueryHandler<
  GetPendingStopDecisionsQuery,
  PendingStopDecisionsView
> {
  constructor(
    private readonly pending: PendingDecisionsReader,
    private readonly incidents: DeliveryIncidentsReader,
  ) {}

  async execute(): Promise<PendingStopDecisionsView> {
    const rows = await this.pending.pending();
    const incidents = await this.incidents.ofRounds([...new Set(rows.map((row) => row.roundId))]);
    return {
      decisions: rows.map((row) => ({
        roundId: row.roundId,
        vehicleName: row.vehicleName,
        passage: row.passage,
        serviceDay: row.serviceDay,
        stopId: row.stopId,
        orderId: row.orderId,
        reference: row.reference,
        customerLabel: row.customerLabel,
        signatureRequired: row.signatureRequired,
        decision: stopDecisionView(row.decision),
        incidents: incidents
          .filter((incident) => incident.stopId === row.stopId)
          .map(deliveryIncidentView),
      })),
    };
  }
}
