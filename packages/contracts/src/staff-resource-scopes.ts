import type { StaffAction, StaffResource } from "./staff-access.js";

/** Ce qu'ouvre chaque niveau d'un droit, en une phrase pour qui règle les rôles. */
export type StaffResourceScope = Readonly<Record<StaffAction, string>>;

/**
 * **Ce que chaque droit ouvre, dit à qui règle les rôles** (Hugo, 2026-10-02 :
 * « pour chaque droit, une description plus claire, une phrase expliquant le
 * scope »).
 *
 * `read` dit ce que la LECTURE ouvre ; `write` ce que l'ÉCRITURE AJOUTE — elle
 * emporte toujours la lecture. Quand un niveau n'ouvre rien, la phrase le dit
 * plutôt que de rester vide : un niveau muet se lit comme un oubli.
 *
 * 🔴 Chaque phrase a été établie depuis le CODE le 2026-10-02 — les gardes des
 * routes `/admin/*` et `/pim/*` (`@AdminSurface`, `@RequirePermission`,
 * `@RequireAnyPermission`), les lectures conditionnées par `hasStaffPermission`,
 * et les gardes de route du back-office (`permissionGuard`). Une phrase qui
 * nomme un AUTRE droit nécessaire (« l'écran demande aussi… ») décrit un garde
 * de route parent tel qu'il était ce jour-là : ce n'est pas une règle, c'est
 * un constat, et il se revérifie quand le garde bouge.
 *
 * Fichier à part de `staff-access.ts`, qui dépasse déjà de loin la taille
 * admise : la table est longue et ne change pas pour les mêmes raisons que le
 * modèle — elle suit les écrans, le modèle suit les décisions d'accès.
 *
 * Le `Record` exhaustif fait qu'une ressource ajoutée sans sa phrase ne
 * compile pas.
 */
export const STAFF_RESOURCE_SCOPES: Readonly<Record<StaffResource, StaffResourceScope>> = {
  pim_catalog: {
    read: "Consulter le référentiel produit : fiches et leur historique, familles, allergènes, ingrédients, appellations, opérations, limites de commande. Ouvre aussi l'espace Référentiel, que ses autres droits supposent, et les fiches vers lesquelles mène le panneau « où sert cette image » de la Médiathèque.",
    write:
      "Créer et modifier fiches et familles, leurs allergènes, ingrédients et opérations — y compris publier ou dépublier une fiche. Ouvre aussi les outils d'agent.",
  },
  pim_channels: {
    read: "Voir ce qui sort du référentiel : les révisions du catalogue et leurs écarts, les produits proposés à la plateforme et ce qu'elle en a reçu.",
    write:
      "Diffuser : créer une révision, choisir les produits proposés à la plateforme et les y pousser — un geste que les clients voient, et qui ne se reprend pas.",
  },
  pim_settings: {
    read: "Voir les points de vente et les contextes de vente du référentiel.",
    write:
      "Créer, modifier ou retirer un point de vente ou un contexte de vente, et générer ou révoquer le QR code d'une table.",
  },
  pim_tax: {
    read: "Voir les taux de TVA et les règles comptables du référentiel (méthode et ratio du prix pro).",
    write:
      "Créer ou modifier un taux de TVA et les règles comptables — et lire le journal fiscal, qui demande ce niveau.",
  },
  media_library: {
    read: "Ouvrir l'écran Médiathèque : parcourir le fonds d'images, ses imports en échec, et savoir quelles fiches affichent chaque image. Aller voir ces fiches demande Référentiel — Catalogue en lecture.",
    write: "Déposer des images, les taguer, les décrire et les retirer du fonds.",
  },
  b2b_companies: {
    read: "Voir tous les comptes clients : liste, fiche complète (identité, conditions, KBIS, adresses, contacts, membres), export, activations, accès à remettre. Ouvre aussi les sections Commercial et Admin du menu.",
    write:
      "Créer et modifier un compte — identité, conditions, adresses, contacts, statut, KBIS —, et rattacher un accès. Décider à la porte pour le client relève de « Décider à la porte ».",
  },
  b2b_orders: {
    read: "Voir les commandes de tous les clients, leur bon PDF et le détail des prix appliqués. Fournit aussi le catalogue vendable et l'historique du client à qui saisit une commande. La preuve de livraison d'une commande demande « Preuves de livraison ».",
    write:
      "N'ajoute qu'un geste : renvoyer au client le rappel de retrait. Passer une commande relève de « Passer une commande pro ».",
  },
  b2b_place_order: {
    read: "N'ouvre rien : il n'y a rien à lire dans ce geste, seule l'écriture compte.",
    write:
      "Composer et passer une commande au nom d'un client pro — devis, brouillon, passation. Demande aussi Commandes en lecture (catalogue et historique du client), et Comptoir en lecture pour saisir depuis le comptoir.",
  },
  b2b_counter: {
    read: "Chercher un client au comptoir et voir ce qu'il faut pour lui vendre — adresses, acheteurs, règlement au compte — sans ouvrir sa fiche complète.",
    write:
      "N'ajoute rien : le comptoir ne fait que lire ; la vente demande « Passer une commande pro ».",
  },
  b2b_supervision: {
    read: "Suivre la journée de toutes les commandes, de la passation au retrait — préparation, colisage, retards, qualité — avec le nom des clients, particuliers compris, sans montant ni contact.",
    write: "Enregistrer un contrôle qualité et ses photos, et consulter les contrôles passés.",
  },
  b2b_subscriptions: {
    read: "Voir les paniers récurrents d'un client.",
    write:
      "N'ajoute rien aujourd'hui : aucun geste ne modifie un panier récurrent depuis le back-office.",
  },
  b2b_catalog: {
    read: "Voir le catalogue vendu — prix, masquage, mise en avant, parité avec le référentiel, réception de ce qu'il diffuse — et l'exporter. Ses écrans demandent aussi Réglages plateforme en lecture.",
    write:
      "Fixer un prix pro ou public, masquer ou mettre en avant un produit, accepter ce que le référentiel diffuse, ajuster une opération côté vente.",
  },
  b2b_pricing: {
    read: "Voir les règles de prix, paliers, gabarits, engagements de volume, mercuriales des clients et le journal tarifaire. L'espace Tarification demande aussi Réglages plateforme en lecture.",
    write:
      "Poser, suspendre ou archiver une règle de prix ou un palier, appliquer un gabarit, engager un volume, rédiger la mercuriale d'un client.",
  },
  b2b_growth: {
    read: "Voir le cockpit commercial, les prospects, le marché et les statistiques de vente de tous les clients.",
    write:
      "Créer et suivre un prospect, choisir les zones et secteurs du marché étudié, relancer son calcul.",
  },
  b2b_appointments: {
    read: "Voir les disponibilités et les rendez-vous clients. Le calendrier demande aussi Croissance en lecture.",
    write: "Régler les disponibilités, prendre ou modifier un rendez-vous.",
  },
  b2b_support: {
    read: "Voir les demandes envoyées par les clients.",
    write: "Marquer une demande comme traitée.",
  },
  b2b_payments: {
    read: "Voir le RIB et le mandat de prélèvement d'un client, et ses justificatifs.",
    write: "Saisir le RIB d'un client, créer, envoyer, faire signer ou révoquer son mandat.",
  },
  b2b_accounting: {
    read: "Ouvrir la Comptabilité : nos entités juridiques et leurs coordonnées bancaires, le cycle de facturation, les liens de paiement, la fidélité, la liste des prélèvements bloqués.",
    write:
      "Modifier nos entités émettrices — dont le compte qui reçoit l'argent —, créer ou annuler un lien de paiement, régler la fidélité. Ne donne pas le blocage du prélèvement, qui a son propre droit.",
  },
  b2b_deferred_payment_block: {
    read: "N'ouvre rien : la liste des blocages se lit avec Comptabilité.",
    write:
      "Bloquer ou débloquer le prélèvement d'un client au crédit. L'écran demande aussi Comptabilité en lecture.",
  },
  lfc_price_limits: {
    read: "Voir les limites sous lesquelles un prix ne descend pas, pro et publiques. L'écran vit dans la Comptabilité, qui demande aussi son droit en lecture.",
    write:
      "Poser, confirmer, archiver ou retirer une limite de prix — pour toute la vente, pros et particuliers.",
  },
  b2b_late_fee: {
    read: "Voir le montant et le taux de TVA de la surtaxe de retard. L'écran vit dans la Comptabilité, qui demande aussi son droit en lecture.",
    write:
      "Fixer, modifier ou supprimer la surtaxe de retard. L'afficher sur une commande n'en dépend pas.",
  },
  b2b_alerts: {
    read: "Voir les alertes en attente, de compte et globales, et leurs règles.",
    write: "Acquitter une alerte, régler les règles d'alerte globales ou celles d'un client.",
  },
  b2b_order_waivers: {
    read: "Voir les dérogations d'heure limite accordées à un client.",
    write:
      "Accorder ou retirer une dérogation : laisser un client commander après l'heure limite, pour un jour donné.",
  },
  b2b_feature_access: {
    read: "Voir si la boutique est ouverte, fermée ou en vitrine, et quelles adresses y gardent accès. L'écran vit dans Admin, qui demande aussi Comptes clients en lecture.",
    write:
      "Ouvrir ou fermer la vente en ligne, la mettre en vitrine, désigner les adresses qui gardent l'accès pour tester.",
  },
  b2b_client_notes: {
    read: "Lire les notes photo du commercial sur un compte client.",
    write: "Ajouter, modifier, réordonner ou retirer une note photo.",
  },
  b2b_settings: {
    read: "Voir les réglages du commerce : points de retrait et leurs créneaux, heures limites, pied de page, mentions légales. Ouvre aussi les espaces Réglages et B2B, que Catalogue vendu et Tarification supposent.",
    write: "Modifier ces réglages — ce qui change l'offre faite à tous les clients.",
  },
  b2b_storefront: {
    read: "Voir la composition des pages de la boutique.",
    write: "Composer la vitrine — formes, positions, rayons, contenus — et l'enregistrer.",
  },
  b2b_contact: {
    read: "Voir les objets de « Nous écrire », la carte de contact de la boutique, et les messages reçus des clients et des visiteurs.",
    write:
      "Créer, modifier, ordonner ou archiver un objet de contact, régler le numéro et la carte de contact, marquer un message traité.",
  },
  production_plan: {
    read: "Voir le plan du soir : l'état de la journée, le lot à produire et son PDF, le prévisionnel.",
    // L'arrêt est parti sous `production_count_stop` le 2026-10-06 : ce niveau
    // n'ouvre plus rien, et le dit (le modèle n'a pas de niveau « sans écriture »).
    write: "N'ajoute rien : arrêter le plan relève de « Production — Arrêt du plan ».",
  },
  production_worksheet: {
    read: "Lire la fiche d'atelier du jour, la fiche PDF d'une commande et les contenants du four.",
    write: "Cocher ce qui est fait, reprendre une ligne, régler les contenants du four.",
  },
  production_packing: {
    read: "Voir le colisage du jour, commande par commande, et ouvrir la fiche d'un bac — celle de son QR —, une lecture partagée avec Chargement.",
    write:
      "Coliser : ajuster quantités et contenants, marquer une commande colisée, et ouvrir le panneau des bacs — déclarer, partager, annuler —, partagé avec Chargement.",
  },
  production_count_stop: {
    read: "N'ouvre rien seul : l'état du plan se lit sous « Production — Plan du soir ».",
    write:
      "Arrêter le plan d'une journée — le soir pour le lendemain, en avance sur l'heure d'arrêt automatique, ou en rattrapage le jour même.",
  },
  production_settings: {
    read: "Voir si le plan s'arrête tout seul ou à la main, son heure d'arrêt ou d'alerte, l'heure limite de commande qui la borne, et les jours fermés du fournil.",
    write:
      "Choisir l'arrêt automatique ou manuel, en régler les heures, et ajouter ou retirer un jour fermé.",
  },
  handover_counter: {
    read: "Voir la file des retraits et le détail d'une commande à remettre.",
    write: "Remettre une commande au client, au scan de son QR ou à la main.",
  },
  delivery_run_sheet: {
    read: "Voir les livraisons du jour avec l'adresse et le contact de chaque client livré. Les procédures n'y paraissent qu'avec Procédures de livraison en lecture.",
    write: "N'ajoute rien : la feuille de route se lit seulement.",
  },
  delivery_settings: {
    read: "Voir la flotte, les types de sacs et leurs contenances, le point de départ et les réglages du calcul de tournée.",
    write:
      "Ajouter, modifier ou retirer un véhicule ou un type de sac, régler les contenances, le départ et le calcul.",
  },
  delivery_availability: {
    read: "Voir à quelle clientèle la livraison est proposée, si elle se demande par créneau ou par échéance, et les marges de production.",
    write:
      "Ouvrir ou fermer la livraison à une clientèle, choisir créneau ou échéance, régler les marges — ce qui change l'offre faite à tous les clients.",
  },
  delivery_fee: {
    read: "Voir les zones de livraison et le frais que chacune ajoute au panier.",
    write: "Ajouter, modifier ou retirer une zone de livraison et son frais.",
  },
  delivery_rounds: {
    read: "Voir les tournées du jour, les livreurs, les incidents et les commandes non remises, et se servir du simulateur et de l'assistant d'achat. Donne aussi la lecture de la flotte et du départ.",
    write:
      "Composer les tournées : répartir et ordonner les arrêts, affecter un livreur, constater le retour, tenir scénarios et bibliothèques d'achat.",
  },
  delivery_loading: {
    read: "Voir le chargement de chaque véhicule et son plan, et ouvrir la fiche d'un bac — celle de son QR —, une lecture partagée avec Colisage.",
    write:
      "Déclarer, partager ou annuler les bacs d'une commande, les charger ou les décharger, et faire partir le véhicule.",
  },
  delivery_driving: {
    read: "Voir SA tournée — celle dont on est le livreur affecté, et aucune autre — avec ses arrêts et ses procédures.",
    write:
      "Commencer sa tournée et charger ses propres sacs. Pour apparaître parmi les livreurs à affecter, il faut aussi Gestes à la porte : sans ce droit, on partirait sans pouvoir remettre ni clore un arrêt.",
  },
  delivery_doorstep: {
    read: "Voir les photos des incidents de sa tournée — rien d'utile sans l'écriture.",
    write:
      "À la porte, sur SA tournée seulement : signaler l'arrivée, remettre ou déposer la commande, déclarer un problème, clore un arrêt sans remise, terminer la tournée.",
  },
  delivery_procedures: {
    read: "Voir la procédure de livraison d'un client — étapes et photos — sur sa fiche et dans la feuille de route, et la décision réglée d'avance à la porte, globale et par adresse.",
    write:
      "Rédiger les étapes et photos d'une procédure, autoriser le dépôt, régler d'avance la décision à la porte, pour tous ou pour une adresse.",
  },
  delivery_decisions: {
    read: "Voir « À décider » : les arrêts où un livreur attend une décision, et la photo du signalement qui l'a ouverte.",
    write:
      "Répondre pour le client — autoriser le dépôt cette fois ou faire rapporter — et être prévenu quand un livreur attend — la notification ne va qu'à ce niveau. Le réglage d'avance de la porte relève de « Procédures de livraison ».",
  },
  delivery_proofs: {
    read: "Voir la preuve de livraison d'une commande — mode, livreur, réceptionnaire, photo et signature — sur sa fiche.",
    write: "N'ajoute rien aujourd'hui : une preuve ne se modifie pas.",
  },
  staff_access: {
    read: "Voir l'équipe, les rôles et leurs droits, et les accès à remettre. L'écran vit dans Admin, qui demande aussi Comptes clients en lecture.",
    write:
      "Inviter, modifier ou suspendre une personne, créer et régler les rôles, poser des dérogations : le droit qui permet de se donner tous les autres. Il ne s'obtient que par le rôle, jamais par dérogation.",
  },
  staff_notifications: {
    read: "Voir la cloche commune à l'équipe et en recevoir la poussée sur un appareil abonné. Les avis adressés à un droit précis, comme « À décider », arrivent sans elle.",
    write:
      "Marquer une notification traitée, pour toute l'équipe — et, depuis l'écran actuel, activer la poussée sur son appareil.",
  },
  ops_health: {
    read: "Voir la carte de santé de l'écosystème et son trafic.",
    write: "N'ajoute rien : la carte de santé se lit seulement.",
  },
  activity: {
    read: "Voir le journal d'activité : qui a fait quoi, dans tous les outils à la fois. L'écran vit dans Admin, qui demande aussi Comptes clients en lecture.",
    write: "N'ajoute rien : le journal se lit seulement.",
  },
};
