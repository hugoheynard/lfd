import type { ClientSheet, ContentLocale } from "@lfd/contracts";

import type { CollectionNoticeMailData } from "../../templates/collection-notice-mail.js";
import type { CustomerAccessOpenedMailData } from "../../templates/customer-access-opened-mail.js";
import type { CustomerRequestMailData } from "../../templates/customer-request-mail.js";
import type { DeliveryEnRouteMailData } from "../../templates/delivery-en-route-mail.js";
import type { InvoiceIssuedMailData } from "../../templates/invoice-issued-mail.js";
import type { MarketingConfirmMailData } from "../../templates/marketing-confirm-mail.js";
import type { MandateMailScheme } from "../../templates/mandate-to-sign-wording.js";
import type { OrderCancelledMailData } from "../../templates/order-cancelled-mail.js";
import type {
  OrderChangeAppliedMailData,
  OrderChangeRefusedMailData,
} from "../../templates/order-change-answer-mail.js";
import type { OrderDelayedMailData } from "../../templates/order-delayed-mail.js";
import type { OrderSheetMailDocument } from "../../templates/order-sheet-mail-document.js";
import type { OrderShortfallMailData } from "../../templates/order-shortfall-mail.js";
import type { PickupPoint } from "../../templates/pickup-itinerary.js";
import type { ProductionDossierMailData } from "../../templates/production-dossier-mail.js";
import type { SubAccountActivityMailData } from "../../templates/sub-account-activity-mail.js";
import type { SubAccountGestureMailData } from "../../templates/sub-account-gesture-mail.js";
import type { VitrineNoticeMailData } from "../../templates/vitrine-notice-mail.js";

/*
 * Le CONTRAT du bloc `mail` (lot S3b, plan
 * `documentation/mail/plan-service-e-mails.md`) : la carte des
 * modèles et la forme de leurs données, ce que les blocs métier écrivent dans
 * une demande. Des types seulement — le rendu reste à l'intérieur du bloc
 * (`mail/templates/`), et chaque forme de données vit à côté du gabarit qui
 * la lit ; le canal la nomme pour ses clients.
 */
export type { InvoiceIssuedMailData, OrderCancelledMailData, OrderSheetMailDocument };
export type { SubAccountActivity } from "../../templates/sub-account-activity-mail.js";
export type { SubAccountGesture } from "../../templates/sub-account-gesture-mail.js";

/**
 * Les **e-mails de la plateforme B2B** — la carte et le registre que
 * `@lfd/mailer` prend en paramètre.
 *
 * Le paquet ignore tout de ce vocabulaire : il fournit le transport et la
 * coquille, l'app décide de ce qu'elle dit. Ajouter un e-mail, c'est ajouter une
 * ligne à la carte — le registre étant un `Record` sur ses clés, oublier le
 * rendu **ne compile pas**.
 *
 * Deux e-mails pour commencer, tous deux **internes** : ce sont les deux
 * endroits où l'équipe apprenait jusqu'ici qu'il s'était passé quelque chose en
 * ouvrant le back-office. Les accusés de réception au client viendront ensuite —
 * ils supposent une adresse d'expédition vérifiée chez le fournisseur.
 */
export interface B2bMails {
  /**
   * **La commande est passée.** Destinataire : le client.
   *
   * Il reçoit la feuille **déjà projetée** — donc sans SKU, sans tarif d'entrée
   * et sans nom d'étage tarifaire. Le gabarit n'a rien à masquer parce qu'il n'a
   * rien reçu de plus.
   *
   * Le **jeton de remise** arrive à part, et pas dans la feuille : s'il y était,
   * les rendus papier pourraient l'imprimer — et le papier d'une livraison
   * voyage dans le carton, où un coursier scannerait son propre colis.
   */
  /**
   * **La commande est prête.** Destinataire : le client.
   *
   * Le seul courriel qui parte à un moment où le client a quelque chose à
   * FAIRE — venir la chercher, ou être là. Il ne reprend pas le décompte : le
   * répéter ferait relire des montants à quelqu'un qui met son manteau.
   */
  "customer.order-ready": {
    readonly sheet: ClientSheet;
    readonly handoverToken: string | null;
    readonly orderUrl: string;
    readonly handoverUrl: string;
    readonly locale: ContentLocale;
    /** Le point GPS du site de retrait, s'il est connu — l'itinéraire (E4, S7). */
    readonly pickupPoint?: PickupPoint | null;
    /**
     * Le **rappel** au client qui n'est pas venu (« Rappel au client », Hugo
     * 2026-10-25) : même courriel, mais il dit « elle vous attend au point de
     * retrait … » au lieu de « c'est prêt ». Absent = l'annonce du colisage.
     */
    readonly reminder?: boolean;
    /**
     * **Le reste de la commande** (plan E7 reliquat, choix 17) : l'envoi de
     * rang > 1 est prêt. Le courriel dit « le reste de votre commande », et
     * compte les pièces DU RESTE — la feuille, elle, reste celle de la
     * commande. Absent = le premier envoi, inchangé.
     */
    readonly remainder?: { readonly pieces: number };
  };
  /**
   * **L'avis de prélèvement** (pré-notification SEPA) — premier avis,
   * rectificatif ou annulation. Destinataire : la société payeuse. Cf.
   * `collection-notice-mail.ts`.
   */
  "customer.collection-notice": CollectionNoticeMailData;
  /**
   * **« Votre facture FA-… »** — à l'émission (plan E6, Q3). Destinataires :
   * la facturation du payeur et celle des sous-comptes. Cf. `invoice-issued-mail.ts`.
   */
  "customer.invoice-issued": InvoiceIssuedMailData;
  /** **La tournée est partie.** Destinataire : le client. Cf. `delivery-en-route-mail.ts`. */
  "customer.delivery-en-route": DeliveryEnRouteMailData;
  /**
   * **« Votre commande prend du retard »** — « Avertir le client », depuis la
   * Supervision. Destinataire : le client. Cf. `order-delayed-mail.ts`.
   */
  "customer.order-delayed": OrderDelayedMailData;
  /**
   * **Le paiement a été refusé.** Destinataire : le client.
   *
   * 🔴 Le seul courriel du parcours qui annonce une mauvaise nouvelle, et le
   * seul que le client recevait *jamais* avant le 2026-09-17 : le dépôt écrivait
   * `failed` dans une colonne que personne ne relisait. Il avait en revanche
   * reçu, à la passation, un message lui annonçant que sa commande entrait en
   * fabrication.
   *
   * ⚠️ **Aucun QR ici.** Une commande impayée ne se retire pas, et lui joindre
   * un code à présenter contredirait la phrase qui la précède.
   */
  "customer.payment-failed": {
    readonly sheet: ClientSheet;
    /** L'app cliente, pour reprendre le règlement. Vide = pas de bouton. */
    readonly settleUrl: string;
    readonly locale: ContentLocale;
  };
  /**
   * **Le paiement n'a pas abouti à temps pour la fournée.** Destinataire : le
   * client. La clôture de la journée a annulé la commande (plan
   * `documentation/commandes/reglement/architecture-abandon-du-reglement.md`, Q4, Q7).
   *
   * Sans bouton : il n'y a plus rien à reprendre, et un lien vers un
   * règlement mort mènerait à un refus.
   */
  "customer.payment-expired": {
    readonly sheet: ClientSheet;
    readonly locale: ContentLocale;
  };
  /**
   * **La modification payée n'a pas pu être appliquée** (doc
   * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.5, §2.7.8).
   * Destinataire : le client qui l'a demandée. La commande garde sa
   * composition, et le complément payé est rendu sur la carte.
   *
   * Sans bouton : la commande n'a pas changé, il n'y a rien à reprendre ; le
   * client peut la modifier de nouveau depuis son espace.
   */
  "customer.order-modification-failed": {
    readonly sheet: ClientSheet;
    /** Le complément rendu, en centimes TTC. */
    readonly complementCents: number;
    readonly locale: ContentLocale;
  };
  /**
   * **La commande a été annulée par l'équipe** (doc
   * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.5). Destinataire :
   * le client. Cf. `order-cancelled-mail.ts`.
   */
  "customer.order-cancelled": OrderCancelledMailData;
  /**
   * **La demande de modification est appliquée / refusée** (voir
   * `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)).
   * Destinataire : l'auteur de la demande. Cf. `order-change-answer-mail.ts`.
   */
  "customer.order-change-applied": OrderChangeAppliedMailData;
  "customer.order-change-refused": OrderChangeRefusedMailData;
  /**
   * **« Votre commande part incomplète »**, écrit à la main par l'équipe
   * après la décision du départ (plan
   * plan E6d (`documentation/commandes/bon-de-livraison.md`)). Jamais envoyé par
   * un abonné. Destinataire : le client. Cf. `order-shortfall-mail.ts`.
   */
  "customer.order-shortfall": OrderShortfallMailData;
  /**
   * **Un de vos sites a agi** — l'avis au principal (plan
   * `documentation/comptes-client/plan-notifications-sous-comptes.md`, N2).
   * Destinataires : les membres acceptés du principal aux rôles cochés. Cf.
   * `sub-account-activity-mail.ts`.
   */
  "customer.sub-account-activity": SubAccountActivityMailData;
  /**
   * **Un de vos sites a fait un geste hors commande** — l'avis au principal
   * de N4 (même plan). Destinataires : ceux de `customer.sub-account-activity`.
   * Cf. `sub-account-gesture-mail.ts`.
   */
  "customer.sub-account-gesture": SubAccountGestureMailData;
  /**
   * **Le lien de règlement d'une commande**, renvoyé par la comptabilité (plan
   * `blocage-et-liens-de-paiement.md`). Destinataire :
   * l'acheteur.
   *
   * Le seul courriel qui porte le lien `/commandes/:id/regler` : l'accusé de
   * passation ne le porte pas, et le courriel de refus pointe vers l'écran de
   * reprise du règlement. Il part à la main, quand quelqu'un a constaté qu'une
   * commande attend encore son argent.
   *
   * Il ne reprend pas le décompte : il répond à UNE question — combien, et où
   * payer. Pas de locale : la comptabilité écrit en français, comme les autres
   * courriels partis d'un geste du back-office.
   */
  "customer.order-payment-link": {
    readonly reference: string;
    readonly totalCents: number;
    /** Jamais vide : sans lien, le renvoi est refusé avant d'arriver ici. */
    readonly settleUrl: string;
  };
  "customer.order-placed": {
    readonly sheet: ClientSheet;
    /** Le jeton de retrait, ou `null` — une livraison n'a pas de comptoir. */
    readonly handoverToken: string | null;
    /**
     * « Voir ma commande » : CETTE commande — `mes-commandes/<id>` pour un compte,
     * la page à jeton (`/annuler#<id>.<jeton>`) pour un invité (2026-11-07).
     */
    readonly orderUrl: string;
    /**
     * Lot C6 (C6.4) : « gérer ou annuler ma commande ». Pour un INVITÉ, la page
     * d'annulation avec son jeton en fragment (`/annuler#<id>.<jeton>`) ; pour
     * un compte, CETTE commande dans `mes-commandes/<id>`, sans secret — la session décide.
     * Vide sans origine connue : pas de lien plutôt qu'un lien inerte. Absent
     * des envois d'avant C6.
     *
     * Plus rendu depuis le 2026-11-07 (« un seul bouton ») : il valait déjà
     * `orderUrl`, que le bouton porte. Le champ reste admis pour les demandes
     * déjà en file.
     */
    readonly manageUrl?: string;
    /** L'URL que le QR encode — vide quand il n'y a pas de jeton. */
    readonly handoverUrl: string;
    /**
     * Le bon de commande en PDF, joint — ou `null` : rendu ou lecture en
     * échec, journalisé, et le courriel part sans (plan `architecture-bon-de-commande.md`,
     * §2.4). Le même document que l'archive.
     */
    readonly document: OrderSheetMailDocument | null;
    /** ⚠️ Rien ne choisit encore : l'appelant passe `fr`. Cf. `mail-copy.ts`. */
    readonly locale: ContentLocale;
    /** Le point GPS du site de retrait, s'il est connu — l'itinéraire (E4, S7). */
    readonly pickupPoint?: PickupPoint | null;
  };
  /**
   * **Le mandat de prélèvement à signer.** Destinataire : le client.
   *
   * 🔴 Le seul courriel du dépôt qui porte un document **opposable** en pièce
   * jointe. Ce qu'il demande n'est pas de lire : c'est de signer, de scanner, et
   * de renvoyer — et de déclarer la RUM à sa banque, sans quoi le premier débit
   * sera refusé. Les trois gestes sont dans le corps, parce qu'un client qui en
   * oublie un croit avoir fini.
   *
   * La RUM est répétée en clair dans le texte, en plus d'être imprimée sur le
   * PDF : c'est elle qu'il dictera à son conseiller, et personne ne rouvre une
   * pièce jointe pour recopier une référence au téléphone.
   */
  "customer.mandate-to-sign": {
    /**
     * Le schéma SEPA **du mandat joint**, figé à sa frappe — pas le réglage
     * courant de l'entité : le courriel décrit le papier qu'il porte.
     */
    readonly scheme: MandateMailScheme;
    readonly companyName: string;
    /** La RUM, dictable au téléphone. */
    readonly reference: string;
    /** L'ICS du créancier — il se déclare avec la RUM. */
    readonly creditorIdentifier: string;
    readonly creditorName: string;
    /** Le PDF du mandat, en base64. */
    readonly pdfBase64: string;
    readonly fileName: string;
  };
  /** Un client a réservé un créneau. Destinataire : la boîte de l'équipe. */
  "staff.appointment-booked": {
    readonly contactName: string;
    /** Jour et heure déjà mis en forme, en heure de Paris — le mail ne recalcule rien. */
    readonly when: string;
    readonly purposeLabel: string;
    readonly channelLabel: string;
    readonly message: string;
    /** Lien direct vers la page du rendez-vous dans le back-office. */
    readonly appointmentUrl: string;
  };
  /**
   * Une alerte s'est déclenchée sur un compte. Destinataire : la boîte de
   * l'équipe.
   *
   * Le corps porte les **constats figés**, pas de quoi les recalculer : un
   * e-mail est une photo, et la moyenne d'aujourd'hui ne doit pas réécrire ce
   * qu'on a constaté hier.
   */
  "staff.account-alert": {
    readonly companyName: string;
    readonly ruleLabel: string;
    readonly orderNumber: string;
    /** Un constat par ligne concernée, déjà mis en forme. */
    readonly findings: readonly string[];
    /** Lien direct vers l'onglet Alertes du compte. */
    readonly accountUrl: string;
  };
  /**
   * Un accès à l'espace vient d'être ouvert. Destinataire : **le client**.
   *
   * Le premier e-mail de cette carte qui ne s'adresse pas à l'équipe — et l'un
   * des **quatre** endroits du système où un lien de mot de passe a le droit
   * d'apparaître (avec `customer.password-reset`, `staff.invited` et
   * `staff.password-reset`). Ce lien vaut prise de contrôle du compte : sa seule
   * destination légitime est la boîte de la personne concernée.
   *
   * ⚠️ La phrase disait « le seul endroit » jusqu'au 2026-09-22, alors qu'ils
   * étaient déjà trois : `staff.password-reset` existe depuis l'ouverture du
   * back-office, et la phrase avait survécu à sa propre péremption.
   */
  "customer.access-opened": CustomerAccessOpenedMailData;
  /**
   * Une société de plus est apparue dans un espace existant. Destinataire : **le
   * client**.
   *
   * Pas de lien de mot de passe ici : la personne en a déjà un. Ce qu'elle doit
   * apprendre, c'est qu'un second établissement s'est ajouté à son espace — sans
   * quoi elle le découvrirait par surprise à sa prochaine commande.
   */
  "customer.company-attached": {
    readonly firstName: string;
    readonly companyName: string;
  };
  /**
   * **Une commande vient d'être passée avec votre adresse** — destinataire : le
   * propriétaire du compte, jamais celui qui commande (plan
   * `architecture-commande-sans-compte.md`, D7).
   *
   * 🔴 **C'est le seul canal par lequel cette information peut sortir.** Une
   * surface publique qui répondrait « ce compte existe » laisserait n'importe
   * qui apprendre qui se fournit ici en testant des adresses — de l'énumération
   * de comptes, et chez nous elle est commerciale. La boîte, elle, n'est lue
   * que par son propriétaire.
   *
   * ⚠️ Il ne porte **ni lien, ni jeton, ni détail de la commande** : le lecteur
   * n'est pas forcément celui qui a commandé, et lui montrer ce qu'un autre a
   * acheté serait fuiter dans l'autre sens. Il dit qu'une commande existe, et
   * quoi faire si ce n'est pas lui.
   */
  "customer.order-placed-with-your-email": {
    readonly firstName: string;
  };
  /**
   * **Une méthode de connexion a été ajoutée au compte.** Destinataire : le
   * client, à l'adresse de son compte.
   *
   * 🔴 **C'est la seule alerte** si la preuve exigée au rattachement était un
   * jour contournée : rien d'autre ne dit à quelqu'un qu'une porte de plus
   * ouvre désormais chez lui. Il part donc même quand le geste est parfaitement
   * normal — un message de trop se lit, un message manquant ne se remarque
   * qu'après.
   *
   * ⚠️ Aucun identifiant du fournisseur : le nom de la méthode suffit à
   * reconnaître ce qu'on vient de faire, et c'est ce qu'on lit à l'écran.
   */
  "customer.login-method-linked": {
    readonly firstName: string;
    /** « Google », « Facebook » — le mot de l'écran, pas le nom de connexion. */
    readonly methodLabel: string;
  };
  /**
   * **La personne a demandé à changer son mot de passe** depuis son profil.
   * Destinataire : elle, à l'adresse de son compte.
   *
   * Distinct de `customer.access-opened` : personne ne lui ouvre quoi que ce
   * soit, elle est déjà entrée. Et distinct de `staff.password-reset`, qui
   * parle du back-office et s'adresse à l'équipe.
   *
   * 🔴 **Il ne dit rien du mot de passe actuel ni des sessions en cours.** Trois
   * comportements d'Auth0 ne sont vérifiés nulle part chez nous : un ticket
   * émis invalide-t-il le mot de passe courant avant d'être suivi, révoque-t-il
   * les sessions, que rend-il sur une identité sociale (plan
   * `documentation/auth-inscription/plan-page-mon-profil.md`, §7.2). Un e-mail
   * parti est parti — on n'y écrit pas une rassurance qu'on n'a pas vérifiée.
   *
   * ⚠️ `staff.password-reset` en porte une, lui : « votre mot de passe actuel
   * reste valable ». Elle est **déjà partie chez des humains** et n'a jamais
   * été vérifiée ; elle se tranche pour les deux surfaces à la fois, et ce
   * gabarit-ci ne la recopie pas en attendant.
   */
  "customer.password-reset": {
    /** Le lien à usage unique, valable une heure. */
    readonly passwordSetupUrl: string;
  };
  /**
   * **« Confirmez votre inscription »** — la double confirmation d'un accord
   * aux e-mails marketing (doc `la-desinscription-et-l-accord.md`, règle
   * 18, C1). Transactionnel. Envoyé par le bloc `mail` lui-même, jamais par
   * un bloc métier. Cf. `marketing-confirm-mail.ts`.
   */
  "customer.marketing-confirm": MarketingConfirmMailData;
  /**
   * Un accès au **back-office** vient d'être ouvert. Destinataire : **le membre
   * de l'équipe**.
   *
   * Un des quatre endroits du système où un lien de mot de passe a le droit
   * d'apparaître, et pour la même raison que les trois autres
   * (`customer.access-opened`, `customer.password-reset`,
   * `staff.password-reset`) : sa seule destination légitime est la boîte de la
   * personne concernée. Qui lit ce lien devient elle.
   *
   * ⚠️ La phrase disait « le second endroit » jusqu'au 2026-09-22 — elle avait
   * survécu à l'arrivée de `staff.password-reset`.
   */
  "staff.invited": {
    readonly firstName: string;
    /** Le lien à usage unique, à durée de vie limitée. */
    readonly passwordSetupUrl: string;
  };
  /**
   * **Le contrôle de mise en service**, envoyé après chaque déploiement à
   * l'admin de secours. Son contenu n'a aucun intérêt — c'est son **arrivée**
   * qui est l'information, et elle prouve la chaîne entière : clé parvenue
   * jusqu'au NestJS, expéditeur sur un domaine vérifié, Resend qui accepte,
   * DKIM qui signe, boîte qui reçoit.
   */
  "ops.deploy-check": {
    /** La révision déployée — pour savoir QUELLE image a prouvé quoi. */
    readonly revision: string;
    /** L'expéditeur réellement utilisé. Le lire dans le corps évite d'aller
     *  fouiller les en-têtes pour vérifier qu'il est bien celui qu'on croit. */
    readonly fromAddress: string;
  };
  /**
   * Un lien de mot de passe pour quelqu'un **déjà entré**. Distinct de
   * `staff.invited` : on n'invite pas une personne qui travaille ici depuis six
   * mois, on lui rouvre une porte qu'elle a elle-même refermée.
   */
  "staff.password-reset": {
    readonly firstName: string;
    readonly passwordSetupUrl: string;
  };
  /** Son accès vient d'être fermé. Elle l'apprend par nous, pas par un refus. */
  "staff.access-suspended": {
    readonly firstName: string;
  };
  /** Son accès est rouvert — elle peut se reconnecter avec son mot de passe. */
  "staff.access-restored": {
    readonly firstName: string;
    readonly backOfficeUrl: string;
  };
  /** **Le dossier du jour**, PDF joint. Cf. `production-dossier-mail.ts`. */
  "staff.production-dossier": ProductionDossierMailData;
  /** Un client demande à être rappelé ou écrit. Destinataire : la boîte de l'équipe. */
  "staff.support-requested": {
    readonly contactName: string;
    readonly purposeLabel: string;
    /** « Rappel au plus vite », « Mardi matin », « Par e-mail »… */
    readonly availability: string;
    readonly phoneNumber: string;
    readonly message: string;
  };
  /** Une demande client (« Nous écrire », « Signaler un problème »). Cf. `customer-request-mail.ts`. */
  "staff.customer-request": CustomerRequestMailData;
  /** **Une annonce aux abonnés de la vitrine.** Destinataire : le contact de l'agence. */
  "agency.vitrine-notice": VitrineNoticeMailData;
}
