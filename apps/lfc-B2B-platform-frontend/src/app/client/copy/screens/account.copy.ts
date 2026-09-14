/**
 * Ce que dit `/mon-compte`, dans les trois langues.
 *
 * Une phrase y fait tout le travail : `identityNote`. L'enseigne se change en
 * autonomie, les mentions du greffe passent par nous — et l'écran le DIT au lieu
 * de griser un champ. Un champ grisé laisse croire à une panne ; une phrase dit
 * une règle.
 *
 * Découpé du dictionnaire général pour la même raison que [[orders.copy]] — et,
 * seul des trois, découpé une fois de plus PAR LANGUE : sept cartes font un
 * dictionnaire de cent phrases, et les trois réunies passaient le fichier à
 * 460 lignes. L'interface reste ici, seule, parce que c'est elle qu'on relit.
 */
export interface AccountCopy {
  readonly title: string;
  readonly lead: string;
  /**
   * La pastille du bandeau, par état du DOSSIER. Elle disait « Compte actif ·
   * dossier complet » en dur, y compris à un compte sans société (relevé le
   * 2026-09-14) : l'inverse du message pour un pro qui vient d'ouvrir le sien.
   */
  readonly states: {
    readonly incomplete: string;
    readonly pending: string;
    readonly active: string;
    readonly suspended: string;
    readonly terminated: string;
  };
  /** La lecture de `/me` a échoué : ce n'est PAS un compte inconnu, et on le dit. */
  readonly loadFailedTitle: string;
  readonly loadFailedBody: string;
  readonly loadRetry: string;
  /** Pendant la lecture du compte : on ne montre rien de ce qu'on ne sait pas encore. */
  readonly loading: string;
  /**
   * Personne n'est entré. L'écran ne montre alors NI la carte de dossier NI des
   * cartes de compte vides en dessous — une seule chose : se connecter.
   */
  readonly signedOutTitle: string;
  readonly signedOutBody: string;
  readonly signIn: string;
  readonly cardKicker: string;
  /** `{month}` le mois d'ouverture, `{ref}` la référence du dossier. */
  /** `{ref}` est remplacé par la référence société — celle qu'on dicte. */
  readonly cardReference: string;
  /** Le repère de l'indicateur des panneaux, en pile. `{n}` = le rang, depuis un. */
  readonly panelDot: string;
  /** Les modes de paiement de la carte : l'un est toujours ouvert, l'autre s'accorde. */
  readonly cardPaymentHead: string;
  readonly cardPaymentOnOrder: string;
  readonly cardPaymentOnAccount: string;
  /** Sous « au compte », tant qu'il n'est pas accordé. */
  readonly cardPaymentPending: string;
  /** Personne de reconnu, ou compte sans entreprise — on le DIT. */
  readonly cardUnknown: string;
  readonly cardUnknownNote: string;
  /** Un champ légal encore vide : une société peut ouvrir sans papiers. */
  readonly identityUnknown: string;
  readonly summaryHead: string;
  readonly summaryNote: string;
  readonly edit: string;
  readonly sections: {
    readonly identity: string;
    readonly users: string;
    readonly kbis: string;
    readonly addresses: string;
    readonly payment: string;
    readonly preferences: string;
    readonly data: string;
  };
  readonly identityBrand: string;
  readonly identityCompany: string;
  readonly identityForm: string;
  readonly identitySiret: string;
  readonly identityVat: string;
  readonly identityNote: string;
  readonly usersHolder: string;
  readonly usersAllRights: string;
  readonly usersAdd: string;
  readonly usersNote: string;
  /** Un rôle non renseigné : les contacts d'avant les rôles n'en ont pas. */
  readonly roleUnset: string;
  readonly tagContact: string;
  readonly kbisHead: string;
  /** `{date}` la date de vérification, `{who}` la personne qui a certifié. */
  /** Deux états, et pas un de plus : le staff a validé ce fichier, ou pas. */
  readonly kbisCertified: string;
  readonly kbisPending: string;
  /** Aucun extrait est un ÉTAT NORMAL : une société ouvre sans papiers. */
  readonly kbisNone: string;
  readonly kbisUpload: string;
  /** `{date}` le dépôt, `{size}` le poids du fichier. */
  readonly kbisFiled: string;
  readonly kbisOpen: string;
  readonly kbisReplace: string;
  readonly kbisNote: string;
  readonly billingHead: string;
  readonly billingNote: string;
  readonly deliveryHead: string;
  /** `{n}` est remplacé par le nombre d'adresses de livraison. */
  readonly deliveryCount: string;
  /** Ce qu'on écrit quand aucune zone ne dessert le code postal. */
  readonly addressNoZone: string;
  /** Ce qu'on écrit quand l'entreprise n'a déclaré aucune adresse. */
  readonly addressNone: string;
  readonly addressDefault: string;
  readonly addressAdd: string;
  readonly termMonthly: string;
  readonly termMonthlySub: string;
  readonly termOrder: string;
  readonly termOrderSub: string;
  readonly stateActive: string;
  readonly stateAvailable: string;
  readonly paymentNote: string;
  readonly prefPickup: string;
  /** Aucune habitude posée — ce n'est pas « retrait », c'est « rien n'a été dit ». */
  readonly prefNone: string;
  readonly prefPickupAt: string;
  readonly prefPickupAny: string;
  readonly prefDeliveryTo: string;
  readonly prefDeliveryAny: string;
  /** Un terme que le commercial n'a pas accordé — ce n'est pas un refus. */
  readonly stateUnavailable: string;
  readonly prefLang: string;
  readonly prefNote: string;
  readonly dataExportOrders: string;
  readonly dataExportOrdersSub: string;
  readonly dataExportPersonal: string;
  readonly dataExportPersonalSub: string;
  readonly dataKeep: string;
  readonly dangerHead: string;
  readonly transferHead: string;
  readonly transferBody: string;
  readonly transferCta: string;
  readonly closeHead: string;
  readonly closeBody: string;
  readonly closeCta: string;
  readonly panelKicker: string;
  readonly panelContact: string;
  readonly panelPhone: string;
  readonly panelRole: string;
  readonly panelCan: string;
  readonly noPhone: string;
  readonly spaceContactHead: string;
  readonly spaceContactBody: string;
  readonly spaceInvite: string;
  readonly spaceInviteNote: string;
  /** `{date}` est remplacé par la date d'envoi de l'invitation. */
  readonly spaceActiveHead: string;
  /** `{date}` est remplacé par la date d'activation de l'espace. */
  readonly spaceSelf: string;
}
