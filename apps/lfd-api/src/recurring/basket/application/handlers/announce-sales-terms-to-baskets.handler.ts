import { Injectable } from "@nestjs/common";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../mail/channels/templates/mail-locale.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BasketBuyerContacts } from "../../../channels/commerce/basket-buyer-contacts.js";
import {
  CONTENT_SALES_TERMS_PUBLISHED,
  SalesTermsPublishedFact,
} from "../../../channels/commerce/sales-terms-published.js";
import type { Basket } from "../../domain/entities/basket.js";
import type { AnnouncedSalesTerms } from "../../domain/entities/basket-sales-terms.js";
import { BasketMailOrigins } from "../../domain/ports/basket-mail-origins.js";
import { BasketRepository } from "../../domain/ports/basket.repository.js";
import { parisDay } from "../services/paris-day.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ANNOUNCE_SALES_TERMS_TO_BASKETS = "recurring.announce-sales-terms.on-published";

/** Le gabarit — 🔴 sa clé préfixe celle de chaque e-mail parti. */
const TEMPLATE = "customer.recurring-sales-terms-changed";

/** « Mes paniers récurrents », dans l'espace client de la boutique. */
export const BASKETS_PATH = "/paniers-recurrents";

/** Les paniers d'un acheteur qui viennent d'apprendre la nouvelle version. */
interface BuyerAnnouncement {
  readonly basketIds: string[];
  readonly announced: AnnouncedSalesTerms;
}

/**
 * **Une nouvelle version des CGV est publiée : les paniers l'apprennent**
 * (plan `commandes/paniers-recurrents/plan-bloc-recurrent.md`, § 7 ; Q-B7).
 *
 * Pour chaque panier actif ou en pause qui applique ce texte, le panier note
 * la version à venir et sa date d'effet (l'envoi + 30 jours) et se
 * sauvegarde ; puis un e-mail par acheteur, le PDF déposé joint par
 * référence. `mail.send` : demandé dans l'unité du reçu, parti après
 * validation.
 *
 * Un rejeu n'envoie rien : `announceSalesTerms` rend faux pour une version
 * déjà annoncée, et la clé de l'e-mail (`<modèle>:<fichier>:<acheteur>`, sans
 * adresse) ne part qu'une fois. Un acheteur sans adresse lisible garde
 * l'annonce sur ses paniers, sans e-mail.
 */
@Injectable()
@DurableHandler({
  type: CONTENT_SALES_TERMS_PUBLISHED,
  subscriber: ANNOUNCE_SALES_TERMS_TO_BASKETS,
})
export class AnnounceSalesTermsToBaskets implements DurableSubscriber {
  constructor(
    private readonly baskets: BasketRepository,
    private readonly contacts: BasketBuyerContacts,
    private readonly origins: BasketMailOrigins,
    private readonly clock: Clock,
    private readonly mail: Mail,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = SalesTermsPublishedFact.fromPayload(delivery.payload);
    const announcements = await this.announce(fact);
    for (const [buyerUserId, announcement] of announcements) {
      await this.notify(fact, buyerUserId, announcement);
    }
  }

  /** Annonce la version à chaque panier vivant du texte ; rend ceux qui l'ont apprise, par acheteur. */
  private async announce(
    fact: SalesTermsPublishedFact,
  ): Promise<ReadonlyMap<string, BuyerAnnouncement>> {
    const now = this.clock.now();
    const sentOn = parisDay(now);
    const published = { revision: fact.revision, fileId: fact.fileId };
    const byBuyer = new Map<string, BuyerAnnouncement>();
    for (const basket of await this.baskets.liveUnderSalesTerms(fact.document)) {
      if (!basket.announceSalesTerms(published, sentOn)) {
        continue;
      }
      await this.baskets.save(basket, now);
      remember(byBuyer, basket);
    }
    return byBuyer;
  }

  private async notify(
    fact: SalesTermsPublishedFact,
    buyerUserId: string,
    announcement: BuyerAnnouncement,
  ): Promise<void> {
    const email = await this.contacts.emailOf(buyerUserId);
    if (email === null) {
      return;
    }
    const base = this.origins.clientBaseUrl();
    await this.mail.send({
      to: email,
      template: TEMPLATE,
      data: {
        effectiveOn: announcement.announced.effectiveOn.toString(),
        basketsUrl: base === null ? "" : `${base}${BASKETS_PATH}`,
        document: {
          fileName: fact.fileName,
          pdfStored: { store: "customer-documents", key: fact.storageKey },
        },
        locale: DEFAULT_MAIL_LOCALE,
      },
      idempotencyKey: `${TEMPLATE}:${fact.fileId}:${buyerUserId}`,
      subjects: announcement.basketIds.map((id) => ({ type: "recurring_basket", id })),
    });
  }
}

/** Range le panier sous son acheteur ; l'annonce est la même pour tous, faite le même jour. */
function remember(byBuyer: Map<string, BuyerAnnouncement>, basket: Basket): void {
  const announced = basket.nextSalesTerms;
  if (announced === null) {
    return;
  }
  const known = byBuyer.get(basket.buyerUserId);
  if (known === undefined) {
    byBuyer.set(basket.buyerUserId, { basketIds: [basket.id], announced });
    return;
  }
  known.basketIds.push(basket.id);
}
