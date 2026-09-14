import type { AddressFormLabels } from '@lfd/b2b-ui/address';
import type { ContactFieldsLabels, DeliveryAddressFormLabels } from '@lfd/b2b-ui/company';
import type { BankAccountFormLabels, MandateOptionsFormLabels } from '@lfd/b2b-ui/payment';
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
    readonly profile: string;
    readonly kbis: string;
    readonly addresses: string;
    readonly bank: string;
    readonly mandate: string;
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
  readonly tagContact: string;
  /** Les champs d'un interlocuteur — le formulaire partagé avec la fiche staff, rôles compris. */
  readonly contactFields: ContactFieldsLabels;
  /** L'en-tête de la fiche d'un interlocuteur quand on la modifie : détenteur, ou contact du carnet. */
  readonly contactEditHolderTitle: string;
  readonly contactEditTitle: string;
  /** Le détenteur sur la fiche de la société n'est PAS l'adresse de connexion, et on le dit. */
  readonly contactEditHolderSubtitle: string;
  readonly contactEditSubtitle: string;
  readonly contactEditFailed: string;
  /** Le retrait d'un contact, confirmé en place (`fold-inline-confirm`). */
  readonly contactRemove: string;
  readonly contactRemoveMessage: string;
  readonly contactRemoveConfirm: string;
  readonly contactRemoveBusy: string;
  readonly contactRemoveGroup: string;
  readonly contactRemoveFailed: string;
  /** Le titre de la zone de danger d'un dialogue — là, et seulement là, qu'on supprime. */
  readonly dangerZone: string;
  /** « Mes informations » : la personne connectée, pas la société. */
  readonly profileFirstName: string;
  readonly profileLastName: string;
  readonly profileEmail: string;
  readonly profileNote: string;
  readonly profilePanelSubtitle: string;
  readonly profileEmailHint: string;
  /** Dit AVANT l'enregistrement ce qu'un changement d'adresse emporte chez Auth0. */
  readonly profileEmailChange: string;
  readonly profileSaveFailed: string;
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
  /** La même phrase pour UNE adresse : « 1 adresses » se lisait à l'écran (relevé le 2026-09-14). */
  readonly deliveryCountOne: string;
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
  readonly addressSaveFailed: string;
  readonly addressSavedToast: string;
  /** L'archivage d'une livraison, confirmé en place (`fold-inline-confirm`) — les mêmes cinq phrases que `contactRemove*`. */
  readonly addressRemove: string;
  /** La question posée avant d'archiver : elle nomme ce qui ne disparaît PAS. */
  readonly addressRemoveMessage: string;
  readonly addressRemoveConfirm: string;
  readonly addressRemoveBusy: string;
  readonly addressRemoveGroup: string;
  readonly addressRemovedToast: string;
  /** En tête du message du serveur, quand suppression ou défaut est refusé. */
  readonly addressActionFailed: string;
  /** Sous le titre du dialogue d'une livraison : le lieu, et comment on y livre. */
  readonly deliveryDialogSubtitle: string;
  /** Le bouton d'envoi d'une livraison NEUVE — « Enregistrer » corrige une existante. */
  readonly deliveryAddSubmit: string;
  /** Le formulaire postal partagé — la facturation, et la base de celui d'une livraison. */
  readonly addressForm: AddressFormLabels;
  /** Le formulaire partagé d'une livraison — rang, postal, consignes — dans la langue de l'écran. */
  readonly deliveryForm: DeliveryAddressFormLabels;
  readonly termMonthly: string;
  /**
   * Sous le crédit mensuel, selon ce que `/me` en dit. 🔴 Il y avait ici UNE
   * phrase, « Accordé le 14/02/2024 · plafond 2 000 € », écrite en dur et lue par
   * tout le monde : `CompanyView` ne porte ni date d'accord ni plafond.
   */
  readonly termGrantedSub: string;
  readonly termRequestedSub: string;
  readonly termNoneSub: string;
  readonly termOrder: string;
  readonly termOrderSub: string;
  readonly stateActive: string;
  readonly stateAvailable: string;
  /** Le crédit demandé, que le commercial n'a pas encore tranché. */
  readonly stateRequested: string;
  readonly paymentNote: string;
  /** Le geste de la carte et du panneau — une DEMANDE, que le commercial valide. */
  readonly termRequest: string;
  readonly termRequestNote: string;
  readonly termRequestFailed: string;
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
  /** Le réglage de l'habitude, dans le panneau : le mode, puis sa destination. */
  readonly prefMethod: string;
  readonly prefMethodNone: string;
  readonly prefMethodPickup: string;
  readonly prefMethodDelivery: string;
  readonly prefPickupPoint: string;
  /** « Suivre le défaut » est un CHOIX, pas un placeholder : il suit le défaut du moment. */
  readonly prefPickupDefault: string;
  readonly prefDeliveryAddress: string;
  readonly prefDeliveryDefault: string;
  /** Accolé à la destination qui est le défaut d'aujourd'hui. */
  readonly prefDefaultTag: string;
  readonly prefSaveFailed: string;
  /** Sous le choix de langue : il vaut tout de suite, sans Enregistrer. */
  readonly prefLangNote: string;
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
  readonly panelPhone: string;
  readonly noPhone: string;
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
  /** Les champs du RIB — le formulaire partagé avec la fiche staff. */
  readonly bankForm: BankAccountFormLabels;
  readonly bankSave: string;
  readonly bankReplace: string;
  readonly bankSavedToast: string;
  readonly bankSaveFailed: string;
  /** Pendant la lecture du mandat SEPA. */
  readonly mandateLoading: string;
  /** La lecture du mandat a échoué : ce n'est PAS « aucun mandat », et on le dit. */
  readonly mandateLoadFailedTitle: string;
  readonly mandateLoadFailedBody: string;
  /** Aucun mandat, ou un mandat qui n'est plus en cours (révoqué, rejeté, en attente chez Stripe). */
  readonly mandateNone: string;
  /** Le brouillon sans scan : l'état EST la consigne (demande de Hugo, plan §0). */
  readonly mandateAwaiting: string;
  /** Le brouillon dont le scan est déposé : le commercial le relit avant d'activer. */
  readonly mandateInReview: string;
  readonly mandateActive: string;
  /** `{reference}` : la RUM, que le client déclare à sa banque. */
  readonly mandateReference: string;
  /** `{date}` : la date portée par le papier signé. */
  readonly mandateSignedOn: string;
  /** `{fileName}` : le nom du scan déposé. */
  readonly mandateProofFile: string;
  readonly mandateGenerate: string;
  /** Le bouton du bas d'un brouillon sans scan : il ouvre le panneau où l'on dépose. */
  readonly mandateSend: string;
  /** Voir / télécharger : les libellés des deux icônes, pour qui ne les voit pas. */
  readonly mandateView: string;
  readonly mandateDownload: string;
  /** Le panneau, sans mandat en cours : ce que le mandat autorise, avant de le générer. */
  readonly mandateNoneBody: string;
  /** Le panneau, brouillon sans scan : imprimer, dater, signer, renvoyer, déclarer à sa banque. */
  readonly mandateAwaitingBody: string;
  readonly mandateInReviewBody: string;
  /** Un mandat actif ne se remplace pas d'ici : le changement de banque passe par le commercial. */
  readonly mandateActiveBody: string;
  readonly mandateDrop: string;
  readonly mandateDropReplace: string;
  /** Sous la zone de dépôt : les formats et la taille que l'API accepte. */
  readonly mandateDropHint: string;
  readonly mandateUploading: string;
  readonly mandateUploadedToast: string;
  /** En tête du message du serveur, quand la génération est refusée. */
  readonly mandateGenerateFailed: string;
  /** En tête du message du serveur, quand le dépôt est refusé. */
  readonly mandateUploadFailed: string;
  readonly mandateFetchFailed: string;
  /** Visible et désactivé tant qu'aucun prestataire n'est branché (plan §5.1). */
  readonly mandateEsign: string;
  readonly mandateEsignSoon: string;
  /** Le geste de la carte, et le titre du panneau des zones 14 et 19. */
  readonly mandateOptions: string;
  /** Sous le titre : ce que ces zones sont. */
  readonly mandateOptionsSubtitle: string;
  /** Dit AVANT les champs : aucune zone n'est obligatoire. */
  readonly mandateOptionsNotice: string;
  /** Tant qu'un brouillon existe : l'enregistrement le rend caduc. */
  readonly mandateOptionsDraftWarning: string;
  /** Les deux zones — le formulaire partagé avec la fiche staff. */
  readonly mandateOptionsForm: MandateOptionsFormLabels;
  readonly mandateOptionsLoading: string;
  readonly mandateOptionsLoadFailedTitle: string;
  /** Sans RIB, les zones n'ont pas de ligne où vivre. */
  readonly mandateOptionsNoBank: string;
  readonly mandateOptionsSave: string;
  readonly mandateOptionsSavedToast: string;
  /** En tête du message du serveur, quand l'enregistrement est refusé. */
  readonly mandateOptionsSaveFailed: string;
  /** La carte sous les cartes : le numéro et l'adresse viennent de l'identité publiée, pas d'ici. */
  readonly supportTitle: string;
  /** Le titre du panneau que la carte ouvre. */
  readonly supportPanelTitle: string;
  readonly supportBody: string;
}
