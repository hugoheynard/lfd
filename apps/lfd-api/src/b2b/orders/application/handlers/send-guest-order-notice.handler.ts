import { Inject, Injectable } from "@nestjs/common";

import {
  COMMERCE_ORDER_PLACED,
  CommerceOrderPlacedFact,
} from "../../../../delivery/channels/commerce/commerce-order-placed.fact.js";
import { MailJournal } from "../../../../platform/mailer/journal/mail-journal.port.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../../platform/time/clock.js";
import { GuestOrderNoticeReader } from "../../domain/ports/guest-order-notice.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";

/**
 * Le canal du registre d'unicité, à côté de `resend` — plan
 * `plan-commande-sans-compte.md`, D7.
 */
const NOTICE_CHANNEL = "guest-order-notice";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_GUEST_ORDER_NOTICE = "orders.send-guest-notice.on-placed";

/**
 * **« Une commande vient d'être passée avec votre adresse »** — prévenir le
 * propriétaire probable, par le seul canal qui ne fuit pas.
 *
 * ## Pourquoi par courriel, et jamais par la route
 *
 * 🔴 Une surface publique qui répondrait « ce compte existe » laisserait
 * n'importe qui apprendre **qui se fournit ici** en testant des adresses. C'est
 * de l'énumération de comptes, et chez nous l'information est commerciale. La
 * boîte, elle, n'est lue que par son propriétaire (D7).
 *
 * ## Trois contraintes, et aucune n'est décorative
 *
 * 1. **La réponse HTTP ne bouge pas d'un octet.** D'où un abonné, et non un
 *    appel dans le handler de passation : l'envoi part après persistance, hors
 *    de la requête. Un écart de durée rouvrirait la fuite par la bande.
 * 2. **La commande reste à l'invité**, jamais rattachée au compte trouvé. Ce
 *    port ne rend qu'une adresse à prévenir ; rien ici ne touche la commande.
 * 3. **L'envoi est borné par adresse et par jour.** Un courriel déclenché par
 *    un anonyme est une arme : sans borne, on harcèle un vrai client en
 *    enchaînant les commandes.
 *
 * ## Pourquoi le registre, et pas `idempotencyKey`
 *
 * ⚠️ `SendMailArgs.idempotencyKey` ne dédoublonne qu'une **reprise du même
 * envoi** chez le fournisseur, et le port dit lui-même qu'elle est « ignorée
 * par les adaptateurs qui ne savent pas dédoublonner ». S'appuyer dessus serait
 * bâtir une protection sur une promesse que rien ne tient.
 *
 * `MailJournal.rememberEvent` est un registre d'unicité **porté par la base**
 * (unicité `(provider, externalId)`), et son propre commentaire annonçait ce
 * moment : « ce registre n'a rien de spécifiquement postal […] on le sortira au
 * SECOND consommateur, pas avant ». Nous sommes ce second.
 *
 * ## Durable depuis le 2026-10-10 (lot E5)
 *
 * Il écoutait `OrderPlacedEvent` en mémoire : un redémarrage entre la
 * passation et le saut laissait le propriétaire de l'adresse sans nouvelle.
 * Il lit désormais `commerce.order_placed`, écrit par les trois passations
 * dans leur transaction (`documentation/journalisation/plan-evenements-durables.md`,
 * §7 quater). Le fait ne porte que `{ orderId }` : le porteur se relit sur la
 * commande. Hors de la requête comme avant — la réponse HTTP ne bouge pas.
 */
@Injectable()
@DurableHandler({ type: COMMERCE_ORDER_PLACED, subscriber: SEND_GUEST_ORDER_NOTICE })
export class SendGuestOrderNotice implements DurableSubscriber {
  constructor(
    private readonly orders: OrderReader,
    private readonly notices: GuestOrderNoticeReader,
    private readonly journal: MailJournal,
    private readonly clock: Clock,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = CommerceOrderPlacedFact.fromPayload(delivery.payload);
    const order = await this.orders.findById(fact.orderId);
    // Une commande introuvable n'est pas un cas à alerter : rien à prévenir.
    if (order === null) {
      return;
    }
    await this.run(order.placedByUserId);
  }

  private async run(placedByUserId: string): Promise<void> {
    const notice = await this.notices.noticeFor(placedByUserId);
    // Le cas NORMAL : le porteur n'est pas un invité, ou personne d'autre ne
    // porte cette adresse. On ne prévient personne, et ce n'est pas un échec.
    if (notice === null) {
      return;
    }

    const fresh = await this.journal.rememberEvent(
      NOTICE_CHANNEL,
      noticeKey(notice.email, this.clock.now()),
    );
    // Déjà prévenu aujourd'hui. Le refus vient de la base, pas d'une lecture :
    // deux commandes simultanées qui liraient d'abord trouveraient toutes deux
    // le registre vide, et enverraient deux fois.
    if (!fresh) {
      return;
    }

    await this.mailer.send({
      to: notice.email,
      template: "customer.order-placed-with-your-email",
      // Le prénom du COMPTE, jamais celui tapé au panier : on salue la personne
      // qu'on prévient, pas celle qui a commandé — et les deux peuvent différer,
      // c'est même toute la raison de cet envoi.
      data: { firstName: notice.firstName },
    });
  }
}

/**
 * Une clé par **adresse et par jour**.
 *
 * ⚠️ Le jour est celui d'UTC, et c'est assez : il borne un abus, il ne date pas
 * un fait métier. Lui donner la journée de service de Paris le ferait dépendre
 * d'un calendrier qui n'a rien à voir avec la question posée ici.
 */
function noticeKey(email: string, at: Date): string {
  return `${email.trim().toLowerCase()}:${at.toISOString().slice(0, 10)}`;
}
