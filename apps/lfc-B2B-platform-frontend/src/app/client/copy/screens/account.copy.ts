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
  readonly cardSince: string;
  readonly cardActive: string;
  readonly cardDiscount: string;
  readonly cardTerm: string;
  readonly cardCap: string;
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
  readonly tagActive: string;
  readonly tagInvited: string;
  readonly tagContact: string;
  readonly kbisHead: string;
  /** `{date}` la date de vérification, `{who}` la personne qui a certifié. */
  readonly kbisVerified: string;
  readonly kbisUpToDate: string;
  /** `{date}` le dépôt, `{size}` le poids du fichier. */
  readonly kbisFiled: string;
  readonly kbisOpen: string;
  readonly kbisReplace: string;
  readonly kbisFreshness: string;
  readonly kbisGauge: string;
  readonly kbisNote: string;
  readonly billingHead: string;
  readonly billingNote: string;
  readonly deliveryHead: string;
  /** `{n}` est remplacé par le nombre d'adresses de livraison. */
  readonly deliveryCount: string;
  readonly addressDefault: string;
  readonly addressAdd: string;
  readonly termMonthly: string;
  readonly termMonthlySub: string;
  readonly termOrder: string;
  readonly termOrderSub: string;
  readonly stateActive: string;
  readonly stateAvailable: string;
  readonly sepaHead: string;
  readonly cardHead: string;
  readonly change: string;
  readonly paymentNote: string;
  readonly prefPickup: string;
  readonly prefLang: string;
  readonly prefNotify: string;
  readonly prefDeliveries: string;
  readonly prefInvoices: string;
  readonly prefEvents: string;
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
  readonly canOrder: string;
  readonly canInvoices: string;
  readonly canAdmin: string;
  readonly yes: string;
  readonly no: string;
  readonly noPhone: string;
  readonly spaceContactHead: string;
  readonly spaceContactBody: string;
  readonly spaceInvite: string;
  readonly spaceInviteNote: string;
  readonly spaceInvitedHead: string;
  /** `{date}` est remplacé par la date d'envoi de l'invitation. */
  readonly spaceInvitedBody: string;
  readonly spaceResend: string;
  readonly spaceCancel: string;
  readonly spaceActiveHead: string;
  /** `{date}` est remplacé par la date d'activation de l'espace. */
  readonly spaceActiveBody: string;
  readonly spaceRevoke: string;
  readonly spaceSelf: string;
}
