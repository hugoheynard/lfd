import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { outsideTransaction } from "../../../platform/database/transaction.store.js";
import { BackgroundWork } from "../../../platform/events/background-work.js";
import { DeliveryDepartureAnnouncer } from "../../channels/commerce/index.js";
import { DeliveryRoundDepartedEvent } from "../../domain/events/delivery-loading.events.js";

/**
 * **Annoncer le départ au commerce** (`documentation/livraisons/plan-en-route.md`,
 * PL3-D2) — c'est lui qui écrira « votre livraison est en route ».
 *
 * ## Pourquoi un abonné, et pas un appel dans le handler du départ
 *
 * Un départ refusé ne publie rien : il n'écrit donc à personne. Et un courriel
 * qui échoue ne doit pas faire échouer un départ déjà décidé au dépôt — d'où le
 * suivi par `BackgroundWork`, qui journalise l'échec et le garde pour lui.
 *
 * ## 🔴 Hors de la transaction du départ
 *
 * Le fait est publié DANS l'unité de travail des deux portes du départ (le
 * journal l'exige, `publishTraced`), et le bus appelle cet abonné de façon
 * synchrone : sans détachement, les lectures du commerce viseraient la
 * transaction du départ, close ou en train de l'être. `outsideTransaction` les
 * rend à la connexion ordinaire.
 *
 * Les commandes annoncées sont celles des arrêts **vivants** : un arrêt retiré
 * de la tournée n'en fait plus partie.
 */
@EventsHandler(DeliveryRoundDepartedEvent)
export class AnnounceDeliveryDeparture implements IEventHandler<DeliveryRoundDepartedEvent> {
  constructor(
    private readonly announcer: DeliveryDepartureAnnouncer,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: DeliveryRoundDepartedEvent): void {
    const departedAt = event.round.departedAt;
    // Le fait n'est publié qu'après `depart()`, qui pose l'instant : un fait
    // sans instant ne vient pas d'un départ, il n'y a rien à annoncer.
    if (departedAt === null) {
      return;
    }
    const departure = { roundId: event.round.id, departedAt, orderIds: event.round.orderIds };
    void this.work.track(
      outsideTransaction(() => this.announcer.announceDeparture(departure)),
      "announce-delivery-departure",
    );
  }
}
