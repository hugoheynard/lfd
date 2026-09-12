import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { OrderReadyEvent } from "../../domain/events/order-ready.event.js";
import { OrderReadyMail } from "../services/order-ready-mail.service.js";

/**
 * **« Votre commande est prête »** — le seul courriel qui parte à un moment où
 * le client a quelque chose à FAIRE.
 *
 * ## Ce qu'il répare
 *
 * Un seul message partait jusqu'ici, et c'était le premier : « c'est
 * enregistré ». Puis plus rien — pas même quand la commande était prête, ce qui
 * est pourtant le seul instant où le client doit se déplacer ou être là. Il
 * fallait ouvrir l'app pour le savoir, ou passer au hasard.
 *
 * ## Pourquoi le QR revient
 *
 * Il était déjà dans la confirmation. Le répéter n'est pas une redite : c'est
 * **maintenant** qu'on s'en sert, et personne ne remonte un fil de courriels le
 * téléphone à la main devant un comptoir. Le message le plus récent doit se
 * suffire à lui-même.
 *
 * ## Pourquoi il ne part qu'une fois
 *
 * Deux garanties se superposent, et c'est voulu : l'écriture du colisage est
 * **conditionnée en base**, donc un seul poste gagne la course et un seul
 * publie le fait ; et la clé d'idempotence est déterministe par commande, donc
 * même un fait rejoué ne ferait pas partir un second message.
 */
@EventsHandler(OrderReadyEvent)
export class SendOrderReadyMail implements IEventHandler<OrderReadyEvent> {
  constructor(
    private readonly mail: OrderReadyMail,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderReadyEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête du comptoir. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "send-order-ready-mail");
  }

  private async run(event: OrderReadyEvent): Promise<void> {
    // 🔴 Clé DÉTERMINISTE par commande : même un fait rejoué sur un bus en
    // processus ne fait pas partir un second message. Le rappel du comptoir,
    // lui, en compose une datée — c'est la même fonction d'envoi, et c'est
    // l'appelant qui choisit s'il se répète.
    await this.mail.send(event.orderId, `order.ready:${event.orderId}`);
  }
}
