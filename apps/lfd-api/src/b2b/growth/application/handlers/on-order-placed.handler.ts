import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { OrderPlacedEvent } from "../../../orders/domain/events/order-placed.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { CompanyNamer } from "../../domain/ports/company-namer.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";

/**
 * Abonné du journal : `order.placed` → une ligne d'activité (sujet = la personne
 * qui a commandé ; signal « lead chaud »). L'`idempotencyKey` est **déterministe
 * par commande** → un événement rejoué n'ajoute rien (le recorder est idempotent).
 * `growth/` ne connaît d'`orders` que la **classe d'événement** (le contrat),
 * jamais ses tables ni ses agrégats.
 */
@EventsHandler(OrderPlacedEvent)
export class OnOrderPlaced implements IEventHandler<OrderPlacedEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly companies: CompanyNamer,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderPlacedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-order-placed");
  }

  /**
   * Le nom du client est **figé dans le fait**, pas rejoint à l'affichage : une
   * enseigne change, et une commande de 2024 doit continuer de nommer son client
   * comme il s'appelait en 2024.
   *
   * Une lecture de plus, et une seule — ici, pas dans le recorder : seul ce
   * fait-là parle d'une société. Les autres événements n'en paient rien.
   */
  private async run(event: OrderPlacedEvent): Promise<void> {
    const client = event.companyId === null ? null : await this.nameOrNull(event.companyId);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderPlaced,
      subjectType: "user",
      subjectId: event.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.orderPlaced}:${event.orderId}`,
      payload: {
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        companyId: event.companyId,
        // Absents pour une commande zéro-friction personnelle : elle n'a pas de
        // société, et l'écran ne prétend pas le contraire.
        ...(client === null
          ? {}
          : { clientName: client.enseigne, clientLegalName: client.raisonSociale }),
        totalCents: event.totalCents,
      },
    });
  }

  /** L'annuaire est best-effort : une société illisible ne perd pas le fait. */
  private async nameOrNull(companyId: string) {
    try {
      return await this.companies.nameOf(companyId);
    } catch {
      return null;
    }
  }
}
