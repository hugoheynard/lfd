import type { MailSpace } from "@lfd/mail-blocks";

import type {
  MarketingStatus,
  UnsubscribeSource,
} from "../../marketing/domain/value-objects/marketing-vocabulary.js";

export type { MarketingStatus, UnsubscribeSource };

/**
 * **Le registre de préférence marketing, vu des autres blocs** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, règle 12) :
 * déclaré ET implémenté par le bloc `mail`. Le registre vit ici ; le recueil
 * chez ceux qui parlent au client (compte, commande), par ce port.
 *
 * U2 n'y pose que ce qui sert déjà : désinscrire, et lire un état (le
 * contrôle à l'envoi de U3). `request`, `accept`, `askable` et `moveAddress`
 * viendront avec leurs lots (C1, C2), quand un appelant existera — une
 * méthode sans appelant est une promesse que personne n'éprouve.
 */
export abstract class MarketingConsent {
  /**
   * Désinscrit l'adresse de cet espace, idempotent. Une adresse inconnue du
   * registre y entre désinscrite.
   */
  abstract unsubscribe(space: MailSpace, address: string, source: UnsubscribeSource): Promise<void>;

  /**
   * L'état de l'adresse pour cet espace ; `null` : jamais demandé. Une
   * adresse effacée et désinscrite se lit encore `unsubscribed` (par son
   * empreinte).
   */
  abstract preferenceOf(space: MailSpace, address: string): Promise<MarketingStatus | null>;
}
