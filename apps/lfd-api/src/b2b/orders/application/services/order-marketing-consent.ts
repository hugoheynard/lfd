import { SHOP_MARKETING_SPACE, type SocietyConsentAnswer } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { MarketingConsent } from "../../../../mail/channels/marketing/marketing-consent.js";
import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";

/** L'étiquette du rappel, au journal s'il échoue. */
const LABEL = "order.marketing-consent";

/** Qui a coché la case, et ce qu'on sait de son adresse. */
export interface OrderConsentBuyer {
  readonly address: string;
  /**
   * L'adresse est-elle prouvée ? Toujours `false` pour un invité (rien
   * n'atteste qu'elle est à lui) ; l'état du compte sinon.
   */
  readonly addressProven: boolean;
}

/**
 * **La case « recevoir les offres » à la passation** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, C2, règles 13, 17,
 * 18, 21), invité compris.
 *
 * La réponse ne voyage pas dans la transaction de la commande : elle est
 * inscrite pour APRÈS sa validation, et le bloc `mail` l'écrit dans la
 * sienne. Une commande qui échoue n'écrit rien ; un registre en panne ne
 * refuse pas une commande — l'échec est journalisé. Une case non cochée
 * n'écrit rien : ce n'est pas un refus, la question reviendra.
 *
 * Le serveur ne trie pas les adresses : une adresse déjà inscrite ou
 * désinscrite est ignorée par le registre lui-même, qui ne dit pas laquelle
 * (règle 17). Le rejeu d'une commande n'appelle jamais ceci : la première
 * réponse fait foi.
 */
@Injectable()
export class OrderMarketingConsent {
  constructor(
    private readonly marketing: MarketingConsent,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  /** À appeler DANS l'unité de travail qui écrit la commande. */
  collect(
    orderId: string,
    buyer: OrderConsentBuyer | null,
    answer: SocietyConsentAnswer | undefined,
  ): void {
    if (buyer === null || buyer.address === "" || answer?.accepted !== true) {
      return;
    }
    const request = () =>
      this.marketing.request(SHOP_MARKETING_SPACE, buyer.address, {
        textVersion: answer.textVersion,
        locale: answer.locale,
        where: "order",
        ref: orderId,
        verified: buyer.addressProven,
      });
    this.afterCommit.defer(() => this.work.track(request(), LABEL), LABEL);
  }
}
