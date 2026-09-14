/**
 * Ce que dit `/mon-compte`, dans les trois langues.
 *
 * Chaque section a deux cartes (règle de Hugo, 2026-09-14). Au bureau, la
 * carte garde ses phrases — `identityNote`, `billingNote` — et ses gestes
 * d'écriture ouvrent un panneau ; en pile, elle ne garde que l'essentiel et un
 * bouton, et les phrases se lisent dans le panneau que ce bouton ouvre.
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
  readonly edit: string;
  /** Le bouton du bas d'une carte dont le panneau se LIT, sans rien à écrire. */
  readonly details: string;
  readonly save: string;
  readonly cancel: string;
  readonly sections: {
    readonly identity: string;
    readonly users: string;
    readonly kbis: string;
    readonly addresses: string;
    readonly bank: string;
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
  /**
   * Sous le titre du panneau d'identité — le premier des panneaux de
   * `/mon-compte`. Il dit les deux régimes avant qu'on les rencontre.
   */
  readonly identityPanelSubtitle: string;
  /** Le libellé de TVA en toutes lettres : dans un champ, l'abréviation de la carte se lit mal. */
  readonly identityVatField: string;
  /**
   * Sous une mention légale ENCORE VIDE : une fois enregistrée, elle ne se
   * corrige plus d'ici — le serveur ignore un champ déjà renseigné.
   */
  readonly identityLegalHint: string;
  /** Sous les mentions déjà renseignées, montrées en lecture. */
  readonly identityLegalLocked: string;
  /** En tête du message du serveur, quand l'écriture est refusée. */
  readonly identitySaveFailed: string;
  /** La pastille du rail, pour qui ne la voit pas. `{n}` le rang depuis un, `{total}` le nombre de sections. */
  readonly railPosition: string;
  readonly usersHolder: string;
  readonly usersAllRights: string;
  readonly usersNote: string;
  /** Le bouton de la carte bureau, et le titre du panneau d'ajout. */
  readonly usersAdd: string;
  /** Le même geste, sur le bouton pleine largeur de la carte mobile. */
  readonly usersAddShort: string;
  readonly usersAddSubtitle: string;
  /** En tête du message du serveur, quand l'ajout est refusé. */
  readonly usersAddFailed: string;
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
  /** Le bouton de la carte quand on ne dépose pas : l'extrait se VOIT dans le panneau. */
  readonly kbisView: string;
  readonly kbisDownload: string;
  /** Le libellé de la zone de dépôt, tant qu'aucun extrait n'est déposé. */
  readonly kbisDrop: string;
  readonly kbisHint: string;
  readonly kbisUploading: string;
  /** En tête du message du serveur, quand le dépôt est refusé. */
  readonly kbisSaveFailed: string;
  readonly kbisFetchFailed: string;
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
  /** Le geste du panneau quand aucune facturation n'est posée. */
  readonly billingFill: string;
  /** Le même geste quand elle l'est. */
  readonly billingEdit: string;
  /** Le titre du formulaire qui modifie une livraison. */
  readonly addressEdit: string;
  readonly deliveryNote: string;
  readonly addressSaveFailed: string;
  readonly addressSavedToast: string;
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
  /** Le résumé de la carte « Mes données » : ce que son panneau explique. */
  readonly dataSummary: string;
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
  /** Pendant la lecture du RIB. */
  readonly bankLoading: string;
  /** La lecture du RIB a échoué : ce n'est PAS « aucun RIB », et on le dit. */
  readonly bankLoadFailedTitle: string;
  readonly bankLoadFailedBody: string;
  /** Aucun RIB déposé — le cas ordinaire d'une société qui ouvre. */
  readonly bankNone: string;
  /** La carte ne dit que l'essentiel : un RIB est là, et ses quatre derniers chiffres. */
  readonly bankRegistered: string;
  /** `{last4}` : les quatre derniers caractères de l'IBAN, le reste masqué. */
  readonly bankLast4: string;
  /** Le titulaire est celui que la BANQUE connaît, et un compte mandaté ne se remplace pas sans nouveau mandat. */
  readonly bankNotice: string;
  readonly bankHolder: string;
  readonly bankLine1: string;
  readonly bankLine2: string;
  readonly bankPostalCode: string;
  readonly bankCity: string;
  readonly bankCountry: string;
  /** Sous l'IBAN : il ne revient d'aucune route. */
  readonly bankIbanHint: string;
  readonly bankSave: string;
  readonly bankReplace: string;
  readonly bankSavedToast: string;
  readonly bankSaveFailed: string;
  /** La carte sous les cartes : le numéro et l'adresse viennent de l'identité publiée, pas d'ici. */
  readonly supportTitle: string;
  /** Le titre du panneau que la carte ouvre. */
  readonly supportPanelTitle: string;
  readonly supportBody: string;
}
