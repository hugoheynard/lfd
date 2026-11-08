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
 * U2 y a posé désinscrire et lire un état ; C1 la demande d'accord ; C2
 * `askable` et `moveAddress` (le compte et la commande) ; C3 la réinscription
 * et la case « partenaires » (« Mes préférences »).
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
   * **Le geste de « Mes préférences »** (C3, règle 13) : comme
   * {@link request}, et en plus le SEUL geste qui lève une désinscription.
   * Une adresse non vérifiée passe par la double confirmation et reste
   * désinscrite jusqu'au clic. `consent.where` doit être `preferences`.
   *
   * @throws {MarketingResubscriptionRefusedError} une désinscription, et le lieu n'est pas `preferences`.
   * @throws {MarketingConfirmationUnavailableError} comme {@link request}.
   */
  abstract resubscribe(
    space: MailSpace,
    address: string,
    consent: MarketingConsentRequest,
  ): Promise<void>;

  /**
   * La case « partenaires » (règles 14, 19, 20) : un accord d'origine
   * `partners` pour chacune des AUTRES sociétés du groupe qui envoient du
   * marketing, telles qu'elles sont À CET INSTANT. Bâtie, éteinte.
   *
   * @throws {MarketingPartnersNotOfferedError} le groupe n'a pas deux sociétés marketing.
   */
  abstract requestPartners(
    from: MailSpace,
    address: string,
    consent: MarketingConsentRequest,
  ): Promise<void>;

  /**
   * La case « partenaires » est-elle proposée ? Seulement à partir de deux
   * sociétés marketing dans le groupe (règle 19) — aujourd'hui, non. Ne
   * dépend d'aucune adresse.
   */
  abstract partnersOffered(): boolean;

  /**
   * Faut-il proposer la case de cet espace à cette adresse ? Vrai seulement
   * sans ligne (règle 17). ⚠️ Un oracle si on le sert pour une adresse
   * quelconque : l'appelant ne le demande que pour les adresses de la
   * personne connectée.
   */
  abstract askable(space: MailSpace, address: string): Promise<boolean>;

  /**
   * Un compte change d'adresse (règle 24) : l'état de l'ancienne suit la
   * nouvelle — dans `space`, ou dans tous les espaces (`null`). Une
   * désinscription protège la nouvelle adresse ; un accord reste accordé.
   */
  abstract moveAddress(space: MailSpace | null, from: string, to: string): Promise<void>;

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
