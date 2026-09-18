import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { OrderPaymentSettledEvent } from "../../domain/events/order-payment-settled.event.js";
import { OrderPlacedMail } from "../services/order-placed-mail.service.js";

/**
 * **L'accusé de réception d'une commande PAYÉE PAR CARTE.**
 *
 * ## Pourquoi il existe
 *
 * 🔴 L'accusé partait à la passation, quel que soit le règlement (Hugo,
 * 2026-09-17 : « je ne veux pas que pour un paiement carte, order placed parte à
 * la passation »). Une commande carte est pourtant écrite **avant** d'être
 * payée : le client dont la carte était refusée ensuite avait donc reçu « votre
 * commande entre dans la fournée de demain matin ».
 *
 * L'accusé attend désormais que le règlement soit acquis. Les deux chemins se
 * partagent {@link OrderPlacedMail} — même feuille, même QR, **même clé
 * d'idempotence** : une commande ne peut pas produire deux accusés, quel que
 * soit le chemin qui l'annonce.
 *
 * ⚠️ Ce qui reste ouvert, et qui n'est pas de ce lot : une carte ABANDONNÉE
 * n'émet aucun événement Stripe. Sa commande reste `pending` pour toujours, et
 * son client ne reçoit jamais rien — ni accusé, ni refus. Fermer ce cas demande
 * d'expirer les commandes impayées
 * (`documentation/order/architecture-reglement-et-compte-de-production.md`, §8).
 */
@EventsHandler(OrderPaymentSettledEvent)
export class SendOrderSettledMail implements IEventHandler<OrderPaymentSettledEvent> {
  constructor(
    private readonly mail: OrderPlacedMail,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderPaymentSettledEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête du webhook. Sans lui,
    // personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "send-order-settled-mail");
  }

  private async run(event: OrderPaymentSettledEvent): Promise<void> {
    await this.mail.send(event.orderId);
  }
}
