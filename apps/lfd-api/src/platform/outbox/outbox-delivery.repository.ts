import type { OutboxDelivery } from "./outbox-delivery.js";

/** Port de l'agrégat `OutboxDelivery` — le rejeu manuel (§8). */
export abstract class OutboxDeliveryRepository {
  abstract load(eventId: string, subscriber: string): Promise<OutboxDelivery | null>;
  abstract save(delivery: OutboxDelivery): Promise<void>;
}
