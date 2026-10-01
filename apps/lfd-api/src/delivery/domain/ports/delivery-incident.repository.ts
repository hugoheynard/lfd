import type { DeliveryIncident } from "../entities/delivery-incident.js";

/** Port d'**écriture** des signalements : un fait s'ajoute, il ne se réécrit pas. */
export abstract class DeliveryIncidentRepository {
  abstract record(incident: DeliveryIncident): Promise<void>;
}
