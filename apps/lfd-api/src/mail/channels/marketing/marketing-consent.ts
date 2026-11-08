import type { MailLocale, MailSpace } from "@lfd/mail-blocks";

import type {
  ConsentPlace,
  MarketingStatus,
  UnsubscribeSource,
} from "../../marketing/domain/value-objects/marketing-vocabulary.js";

export type { ConsentPlace, MarketingStatus, UnsubscribeSource };

/**
 * **Un accord recueilli** (plan de désinscription, règle 18) : la preuve que
 * la CNIL demande, et ce qui décide de la double confirmation.
 */
export interface MarketingConsentRequest {
  /** La version du texte de la case cochée (dictionnaire de la boutique). */
  readonly textVersion: string;
  /** La langue de la case — et celle de l'e-mail de confirmation. */
  readonly locale: MailLocale;
  /** Le lieu du recueil. */
  readonly where: ConsentPlace;
  /** La référence opaque de l'acte (commande, compte) ; `null` sans acte (pied de page). */
  readonly ref: string | null;
  /**
   * L'adresse est-elle VÉRIFIÉE (compte confirmé) ? Oui : l'accord vaut tout
   * de suite. Non (invité, compte non confirmé) : il attend le clic.
   */
  readonly verified: boolean;
}

/**
 * **Le registre de préférence marketing, vu des autres blocs** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, règle 12) :
 * déclaré ET implémenté par le bloc `mail`. Le registre vit ici ; le recueil
 * chez ceux qui parlent au client (compte, commande), par ce port.
 *
 * U2 y a posé désinscrire et lire un état ; C1 y pose `request`, la demande
 * d'accord. `askable` et `moveAddress` viendront avec C2, quand un appelant
 * existera — une méthode sans appelant est une promesse que personne
 * n'éprouve.
 */
export abstract class MarketingConsent {
  /**
   * **Recueille un accord** (règles 18 et 21) — dans la transaction propre au
   * bloc `mail`, à appeler APRÈS la validation de l'acte qui le porte.
   *
   * - jamais demandé : adresse vérifiée → `accepted` ; sinon `pending` et un
   *   e-mail transactionnel « Confirmez votre inscription » (lien de 7 jours) ;
   * - en attente : une adresse vérifiée confirme ; sinon rien (le lien
   *   envoyé vaut encore) ;
   * - déjà accepté : rien ;
   * - désinscrit : RIEN, ni ligne ni e-mail — une case ne réinscrit jamais.
   *
   * Ne dit pas ce qu'il a fait : la réponse à l'appelant est la même pour
   * toute adresse (pas d'oracle, règle 17).
   *
   * @throws {MarketingConfirmationUnavailableError} adresse non vérifiée, et
   *   l'espace ne peut pas envoyer de confirmation ici ; rien n'est rangé.
   */
  abstract request(
    space: MailSpace,
    address: string,
    consent: MarketingConsentRequest,
  ): Promise<void>;

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
