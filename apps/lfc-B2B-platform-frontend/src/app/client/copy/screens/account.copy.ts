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
  readonly state: string;
  readonly cardKicker: string;
  /** `{month}` le mois d'ouverture, `{ref}` la référence du dossier. */
  readonly cardActive: string;
  /** `{ref}` est remplacé par la référence société — celle qu'on dicte. */
  readonly cardReference: string;
  /** Le terme CONVENU, quand il y en a un. */
  readonly cardTermMonthly: string;
  /** Le défaut : payer à la commande, ce que tout le monde peut faire. */
  readonly cardTermOrder: string;
  /** Personne de reconnu, ou compte sans entreprise — on le DIT. */
  readonly cardUnknown: string;
  readonly cardUnknownNote: string;
  /** Un champ légal encore vide : une société peut ouvrir sans papiers. */
  readonly identityUnknown: string;
  readonly cardTerm: string;
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
