/**
 * Tout ce que l'app cliente dit, par écran.
 *
 * Un seul objet par langue, et une INTERFACE pour les tenir : ajouter une phrase
 * quelque part casse la compilation des trois dictionnaires tant qu'ils ne l'ont
 * pas. C'est le seul garde-fou qui empêche une langue de dériver en silence.
 *
 * Pourquoi pas `@angular/localize` : il compile un bundle PAR langue et choisit
 * au chargement. Ici la langue se change **à chaud**, depuis le chrome, sans
 * rechargement — trois dictionnaires en mémoire coûtent quelques kilo-octets et
 * répondent au doigt.
 */
import type { AccountCopy } from './screens/account.copy';
import type { LoyaltyCopy } from './screens/loyalty.copy';
import type { OrdersCopy } from './screens/orders.copy';

/** Les titres d'onglet, par page. */
export interface PageTitles {
  readonly welcome: string;
  readonly registration: string;
  readonly proLanding: string;
  readonly proOpening: string;
  readonly orders: string;
  readonly invoices: string;
  readonly account: string;
  readonly profile: string;
  readonly loyalty: string;
  readonly shop: string;
  readonly payment: string;
  readonly pickupQr: string;
  readonly orderRevision: string;
  readonly guestOrder: string;
  readonly salesTerms: string;
  readonly orderConfirmed: string;
  readonly connection: string;
}

/** La clé d'un titre d'onglet — ce qu'une route porte en `data.pageTitle`. */
export type PageTitleKey = keyof PageTitles;

export interface ClientCopy {
  readonly chrome: {
    /** L'avis après une connexion Google refusée : un compte porte déjà l'adresse. */
    readonly identityConflict: string;
    readonly identityConflictDismiss: string;
    /** Le bandeau d'installation : un message par contexte, puis ses deux gestes. */
    readonly installIosSafari: string;
    readonly installIosOther: string;
    readonly installPrompt: string;
    readonly installAction: string;
    readonly installLater: string;
    readonly back: string;
    readonly menu: string;
    readonly notifications: string;
    readonly lang: string;

    /**
     * L'entrée du VISITEUR, dans la barre : se connecter, et la porte d'à côté
     * pour qui n'a pas encore de compte.
     *
     * 🔴 Elle ne paraît qu'à un visiteur non reconnu. Un client déjà connecté a
     * son menu de personne au même endroit — lui proposer de se connecter
     * serait lui dire qu'il ne l'est pas.
     */
    readonly signIn: string;
    readonly createAccount: string;
    readonly kickerWelcome: string;
    readonly kickerRappel: string;
    readonly kickerCommande: string;
    readonly kickerShop: string;
    readonly kickerCart: string;
    readonly kickerPay: string;
    readonly kickerQr: string;
    readonly kickerDone: string;
    readonly deskKicker: string;
    /** La ligne sous la marque, dans la barre : ce qu'est la maison, sur tous les écrans. */
    readonly brandLine: string;
    /** Le nom du déclencheur du menu de la personne, dans l'en-tête : l'initiale seule n'en est pas un. */
    readonly accountMenu: string;
    /** L'entrée qui ouvre le profil de la personne — et le titre de son dialogue. */
    readonly myProfile: string;
    /** Le nom du groupe d'entrées qui bascule d'espace de travail (plan espace de travail, D8). */
    readonly workspaceChoice: string;
    /** L'entrée de l'espace perso, en tête du sélecteur. */
    readonly workspacePersonal: string;
    /** La ligne sous le sélecteur quand on travaille en perso. */
    readonly workspaceCurrentPersonal: string;
    /** Ce qui précède, pour un lecteur d'écran, l'enseigne en cours sous le sélecteur. */
    readonly workspaceCurrentFor: string;

    /**
     * ── LES TROIS POPOVERS DE LA BARRE (maquette du 2026-09-20) ──────────────
     *
     * Le menu d'espaces, la cloche et le panier partagent une grammaire — une
     * bande de tête, des sections, un pied — et donc un voisinage de libellés.
     */

    /** Le sur-titre de la section des espaces, dans le popover d'identité. */
    readonly workspaceSection: string;
    /** La nature d'un espace, en pastille sur sa carte. */
    readonly workspaceKindPro: string;
    readonly workspaceKindPersonal: string;
    /**
     * La note d'une carte d'espace PERSO. Les cartes de société portent leur
     * raison sociale ; le perso n'en a pas, et une carte sans note se lirait
     * comme un espace incomplet.
     */
    readonly workspacePersonalNote: string;
    /**
     * La pastille d'un SITE atteint par héritage (S6) : on y entre par son
     * principal, pas par un rattachement à soi.
     */
    readonly workspaceKindSite: string;
    /** La note d'un site atteint : le principal par lequel on y entre. `{name}` = le principal. */
    readonly workspaceVia: string;
    /** La seconde ligne du déclencheur d'identité, quand on travaille pour une société. */
    readonly workspaceRolePro: string;

    /** La sortie du popover de notifications — « Fermer », pas « Fermer le menu ». */
    readonly notificationsClose: string;
    /**
     * Le compte du fil : `{unread}` non lues, `{total}` en tout.
     *
     * ⚠️ Une seule forme, au pluriel : le fil est une MAQUETTE (cf.
     * `notifications.fixture.ts`), et accorder un compteur qu'aucun serveur
     * n'alimente serait de la mécanique sans sujet. À reprendre avec le vrai fil.
     */
    readonly notificationsCount: string;
    /** Ne paraît que s'il reste des non-lues. */
    readonly notificationsMarkAll: string;
    /** Le fil est vide — l'état, pas une erreur. */
    readonly notificationsEmpty: string;

    /** Le pied du popover du panier : il mène à la page où l'on règle. */
    readonly cartOpen: string;

    /**
     * Le lien d'évitement du shell, premier arrêt du clavier (RGAA 12.7) : fold
     * l'écrit en anglais par défaut, il se donne donc dans la langue de la page.
     */
    readonly skipLink: string;

    /**
     * Le titre de l'onglet (`<title>`) de chaque page du shell client, marque
     * comprise — lu par `ClientTitleStrategy` sur la clé `pageTitle` de la
     * route (RGAA 8.6 : il suit la langue choisie).
     */
    readonly pageTitles: PageTitles;
  };

  readonly nav: {
    /** Les six destinations, dans l'ordre — cf. `ClientNav`. */
    readonly destinations: {
      readonly shop: string;
      readonly orders: string;
      readonly invoices: string;
      readonly baskets: string;
      readonly account: string;
      readonly loyalty: string;
    };
    /** `{n}` est remplacé par le nombre de factures en attente. */
    readonly invoicesDue: string;
    /** `{n}` est remplacé par le nombre de gabarits de panier récurrent. */
    readonly basketsCount: string;
    /** Le nom du panier dans la barre — il n'est plus une destination du menu. */
    readonly cart: string;
    /** Ce que porte une destination dont l'écran n'existe pas encore. */
    readonly soon: string;
    readonly close: string;
    readonly newOrder: string;
    /**
     * Le nom d'un lien qui ouvre un NOUVEL ONGLET (RGAA 13.2, lot A3) :
     * `{name}` est remplacé par son texte visible, qui reste en tête du nom.
     */
    readonly newTab: string;
    readonly newOrderSub: string;
    readonly house: string;
    /** Les trois liens « la maison » : libellé, puis sa note à droite. */
    readonly houseLinks: readonly [
      readonly [string, string],
      readonly [string, string],
      readonly [string, string],
    ];
    readonly logout: string;
    readonly address: string;
    /** Le salut du menu. `{name}` est remplacé par le prénom reconnu. */
    readonly hello: string;
    /** Le même, quand le compte ne porte pas encore de prénom. */
    readonly helloAnonymous: string;
  };
  readonly hero: {
    readonly welcomeTitle: string;
    readonly welcomeIntro: string;
    readonly rappelTitle: string;
    readonly rappelIntro: string;
  };
  readonly aside: {
    readonly proof: readonly [string, string, string];
    readonly address: string;
  };
  readonly signup: {
    /** Le bouton du fournisseur — le libellé qu'imposent ses règles de marque. */
    readonly google: string;
    /** Le second fournisseur — cf. `FACEBOOK_CONNECTION` pour ce qu'il exige du tenant. */
    readonly facebook: string;
    /**
     * Le filet qui sépare les fournisseurs de la saisie — « ou par e-mail », et
     * non un « ou » seul : ce qui suit n'est pas une autre façon de faire la
     * même chose, c'est l'autre moyen d'entrer.
     */
    readonly orEmail: string;
    readonly eyebrow: string;
    readonly alreadyLead: string;
    readonly alreadyLink: string;
    readonly pitch: string;
    readonly firstName: string;
    readonly firstNamePlaceholder: string;
    readonly tel: string;
    readonly telPlaceholder: string;
    readonly email: string;
    readonly emailPlaceholder: string;
    /**
     * L'ACTION du formulaire.
     *
     * ⚠️ Elle a d'abord été le bouton qui DÉPLIAIT les champs en pile, quand
     * ils étaient repliés. Le pli a disparu le 2026-09-21 avec la raison qui le
     * tenait (cf. le composant) ; le libellé, lui, valait déjà pour une action
     * finale, et sert donc de CTA. {@link submit} est devenu le TITRE de la
     * carte — la réf y met « Créer mon compte », qui est exactement ce qu'il
     * disait.
     */
    readonly open: string;
    /** Le titre de la carte. */
    readonly submit: string;
    readonly fine: string;
    readonly fineInline: string;
    readonly legal: string;
    /**
     * La page `/login` — où renvoie le garde d'authentification quand une
     * route demande une session (`/mon-compte`…). Ses textes étaient en dur
     * dans le gabarit jusqu'au lot T4 des textes de la boutique.
     */
    readonly loginPage: {
      readonly title: string;
      readonly lead: string;
      readonly checking: string;
      readonly signIn: string;
      readonly signUp: string;
      readonly hint: string;
    };
  };
  readonly rappel: {
    readonly asapGroup: string;
    readonly asapTitle: string;
    readonly asapSub: string;
    readonly todayGroup: string;
    readonly note: string;
    /** `{phone}` est remplacé par le numéro connu. */
    readonly phone: string;
    /** Quand le compte n'en porte pas encore — on demande au lieu de supposer. */
    readonly phoneUnknown: string;
    readonly ctaIdle: string;
    readonly ctaReady: string;
    readonly slotFree: string;
    readonly slotFull: string;
    readonly slotOven: string;
  };
  readonly doors: {
    readonly or: string;
    readonly alreadyTitle: string;
    readonly alreadySub: string;
    /**
     * L'attente de `/connexion/code`, le lien de l'e-mail d'invitation : le
     * temps de partir chez Auth0 (2026-10-09).
     */
    readonly emailCodeEntry: string;
    /**
     * `/connexion/erreur` : Auth0 a refusé la connexion (2026-10-09). Le texte
     * d'Auth0 suit le sous-titre tel quel — c'est le cas réel.
     */
    readonly signInFailedTitle: string;
    readonly signInFailedSub: string;
    readonly signInCancelledTitle: string;
    readonly signInCancelledSub: string;
    /**
     * `/connexion/erreur` après un refus `account.invitation.expired`
     * (2026-10-10). Le sous-titre est le message du serveur, pas une copie.
     */
    readonly invitationExpiredTitle: string;
    readonly signInFailedBack: string;
    readonly firstTitle: string;
    readonly firstSub: string;

    /**
     * **Le dialogue « Se connecter »** (Hugo, 2026-09-22 : « fais-moi un dialog
     * de connexion avec les méthodes »).
     *
     * 🔴 Il existe parce que se connecter n'avait PAS d'écran à soi : le geste
     * partait droit chez Auth0, et la porte « Déjà client ? » n'apparaissait
     * qu'en pile (`only-narrow` sur `welcome-step`). Au bureau, on ne voyait
     * donc que l'inscription — « là je n'ai que créer mon compte ».
     *
     * ⚠️ La phrase ne PROMET rien sur les méthodes disponibles : elles
     * dépendent de ce que la personne a rattaché à son compte, et le dialogue
     * les propose toutes sans savoir lesquelles la concernent. Annoncer
     * « connectez-vous avec Google » à qui ne l'a jamais rattaché enverrait
     * vers un refus.
     */
    readonly signInLead: string;
    /**
     * L'action du dialogue — elle mène à l'écran d'Auth0, elle ne connecte pas.
     * Depuis le 2026-10-09, elle part sur la connexion par code e-mail.
     */
    readonly signInSubmit: string;
    /**
     * Le lien discret vers le parcours par mot de passe — connexion dans le
     * dialogue, inscription sur la carte de l'accueil. La capacité reste ;
     * elle n'est plus le chemin par défaut (2026-10-09).
     */
    readonly usePassword: string;

    /**
     * **Le segmenté des deux portes** — particulier / professionnel, en tête de
     * l'inscription (handoff `handoff-inscription`, §1).
     *
     * Les deux sous-lignes ne sont pas décoratives : elles sont le SEUL moyen
     * pour qui hésite de savoir laquelle est la sienne. « Professionnel » tout
     * seul se lit aussi bien comme « je travaille » que comme « je commande
     * pour un établissement » — d'où « Je commande pour… », qui tranche sur
     * l'usage et non sur le statut.
     */
    readonly switchLabel: string;
    readonly persoLabel: string;
    readonly persoSub: string;
    readonly proLabel: string;
    readonly proSub: string;

    /**
     * Le pied de la porte PRO, qui propose l'autre (§1 : « le pied de chaque
     * formulaire propose l'autre porte en toutes lettres »).
     *
     * ⚠️ Le pied de la porte PERSO, lui, n'a rien à recevoir ici : il l'a déjà
     * sous le rappel commercial, en `pro.openAccount` (vérifié le 2026-09-21).
     * Un second libellé pour le même geste finirait par diverger du premier.
     */
    readonly toPersoLead: string;
    readonly toPersoLink: string;

    /**
     * Et le pied de la porte PARTICULIER, qui propose la pro (§1). Son LIEN est
     * `pro.openAccount`, qui existait déjà — deux libellés pour le même geste
     * finiraient par diverger.
     */
    readonly toProLead: string;
  };
  readonly event: {
    readonly badge: string;
    /** Deux lignes, séparées par un retour : la carte les rend telles quelles. */
    readonly title: string;
    readonly pitch: string;
    readonly cta: string;
    readonly pending: string;
  };
  readonly commande: {
    /** `{name}` est remplacé par le prénom du client reconnu. */
    readonly title: string;
    /** La même salutation quand le prénom n'est pas connu — on ne l'invente pas. */
    readonly titleAnonymous: string;
    readonly intro: string;
    /** Le nom du groupe de points du carrousel, pour les lecteurs d'écran. */
    readonly sectionsLabel: string;
    readonly newOrderTitle: string;
    readonly newOrderSub: string;
    readonly nowTitle: string;
    readonly pickupBadge: string;
    /** Deux lignes, séparées par un retour : la carte les rend telles quelles. */
    readonly pickupTitle: string;
    readonly pickupDetail: string;
    readonly pickupNote: string;
    /** Au-delà du pli : le bouton nomme l'action, la condition porte la remise. */
    readonly pickupDetailWide: string;
    readonly pickupCta: string;
    /**
     * `{value}` = la meilleure remise que le back-office pose sur un point. Sans
     * remise, la carte garde la note du téléphone : aucune valeur par défaut.
     */
    readonly pickupNoteWide: string;
    readonly deliveryBadge: string;
    /** Deux lignes, séparées par un retour. */
    readonly deliveryTitle: string;
    readonly deliveryDetail: string;
    readonly deliveryNote: string;
    readonly deliveryDetailWide: string;
    readonly deliveryCta: string;
    readonly deliveryNoteWide: string;
    readonly eventBadge: string;
    /** Deux lignes, séparées par un retour. */
    readonly eventTitle: string;
    readonly eventDetail: string;
    readonly eventNote: string;
    readonly cateringBadge: string;
    /** Deux lignes, séparées par un retour. */
    readonly cateringTitle: string;
    readonly cateringDetail: string;
    readonly cateringNote: string;
    readonly browseTitle: string;
    readonly browseSub: string;
    readonly againTitle: string;
    readonly againSub: string;
    readonly againAction: string;
    /** La phrase de reprise, au bureau : elle porte le rappel dans son texte. */
    readonly againLead: string;
    readonly urgenceTitle: string;
    readonly urgencePitch: string;
    readonly urgenceCta: string;
    readonly pending: string;
  };
  readonly shop: {
    readonly changeService: string;
    /** Pour qui visite le rayon AVANT d'avoir dit où il est servi. */
    readonly pickService: string;
    readonly pickServiceHint: string;
    /**
     * Ni retrait ni livraison ne sont proposés à qui regarde (2026-10-16) :
     * on le dit au panier, au lieu d'un parcours qui mène au refus.
     */
    readonly noService: string;
    /** Les trois états du chargement de la vitrine — cf. `ShopCatalogue`. */
    readonly loading: string;
    readonly loadFailedTitle: string;
    readonly loadFailedHint: string;
    readonly loadRetry: string;
    /** L'adresse d'une fiche nomme un article absent du catalogue du visiteur (2026-10-23). */
    readonly pieceUnavailable: string;
    readonly pieceUnavailableBack: string;
    readonly searchPlaceholder: string;
    readonly clearSearch: string;
    readonly allShelves: string;
    readonly allShelvesTitle: string;
    /** `{query}` est remplacé par ce qui a été cherché. */
    readonly resultsFor: string;
    /** `{count}` est remplacé par le nombre de références montrées. */
    /**
     * Le MOT seul — « pièces », pas « {count} pièces ». C'est `fold-search` qui
     * pose le nombre devant, et il le fait pour que le compte soit ANNONCÉ.
     */
    readonly piecesUnit: string;
    readonly emptyTitle: string;
    readonly emptyHint: string;
    /** L'action de la tuile mise en avant dans la grille — elle mène au rayon de l'opération. */
    readonly openFeatureShelf: string;
    /** Les flèches d'une case de vitrine qui porte plusieurs contenus. */
    readonly slidePrevious: string;
    readonly slideNext: string;
    /** Un point du défilement. `{n}` et `{count}` sont remplacés. */
    readonly slideGoTo: string;
    /**
     * Le bouton pause / lecture d'une case qui défile seule (RGAA 13.8). Le
     * libellé dit l'action, pas l'état : il change avec elle.
     */
    readonly slidePause: string;
    readonly slidePlay: string;
    readonly shelvesGroup: string;
    /**
     * `{price}` est remplacé par le montant. Le rayon affiche du **hors taxe**,
     * et un prix alimentaire sans mention se lit TTC : la mention n'est pas une
     * décoration, c'est ce qui empêche la vignette de mentir.
     *
     * La forme ASSEMBLÉE, pour tout ce qui n'a qu'une chaîne à poser — un fait
     * de fiche, un libellé de bouton.
     */
    readonly priceHt: string;
    /**
     * La seule mention, sans le montant : la vignette la compose elle-même pour
     * lui donner un registre plus discret que le prix, qu'elle ne fait que
     * qualifier.
     *
     * ⚠️ Elle doit rester la **fin** de {@link priceHt} — deux mots pour la même
     * chose sont deux mots qui divergent. `client-copy.spec.ts` le vérifie dans
     * les trois langues.
     */
    readonly htSuffix: string;
    /** Le rayon d'un particulier affiche le TTC (D13) — même forme que son voisin. */
    readonly priceTtc: string;
    readonly ttcSuffix: string;
    /**
     * Lu seulement, à la place d'un prix barré et du prix servi (RGAA 3.1,
     * lot A5) : la rature ne s'entend pas. `{was}` l'ancien, `{now}` le nouveau.
     */
    readonly priceStruck: string;
    /**
     * Le repère d'un visiteur venu de `/pro` : la boutique montre les tarifs pro
     * de base hors taxe, et le dit — ce ne sont pas encore SES conditions.
     */
    readonly proVisitNote: string;
    readonly proVisitSignIn: string;
    /** Revenir en taxe comprise efface le choix de la visite. */
    readonly proVisitShowTtc: string;
    /** Un visiteur en visite pro ne commande pas : le repère le dit (2026-10-19). */
    readonly proVisitOrder: string;
    /** Le « + » en visite pro ouvre la connexion. `{name}` = le nom de la pièce. */
    readonly addAriaProVisit: string;
    /** `{name}` est remplacé par le nom de la pièce. */
    readonly addAria: string;
    readonly removeAria: string;
    /**
     * Ce que la région d'état dit après un « + » ou un « − » (RGAA 7.5).
     * `{name}` = la pièce, `{count}` = sa quantité au panier.
     */
    readonly cartStatusCount: string;
    /** La même, quand la dernière pièce sort du panier. `{name}` = la pièce. */
    readonly cartStatusRemoved: string;
    /** Le titre (lu, non affiché) de la vitrine composée de l'accueil (RGAA 9.1). */
    readonly storefrontTitle: string;
    /** `{count}` est remplacé par le nombre de pièces au panier. */
    readonly cartTitle: string;
    readonly cartEmpty: string;
    /** La raison d'une suggestion du staff au PANIER qui n'a pas écrit de phrase (RS2). */
    readonly staffAdvice: string;
    /** La même, sur la FICHE d'un article (Hugo, 2026-10-18). */
    readonly alsoLike: string;
    /** La même, à l'ACCUEIL (RS7) — titre de la rangée. */
    readonly ourPicks: string;
    /**
     * Le titre d'une suggestion CALCULÉE au panier (R2) — `{name}` est
     * l'article du panier avec lequel d'autres clients l'ont pris.
     */
    readonly boughtWith: string;
    /** Le titre de la rangée des habituels d'un PRO, à l'accueil (R1). */
    readonly usuals: string;
    /**
     * La raison d'un habituel commandé surtout un jour de la semaine (R1) —
     * « Tous les mardis ». Une phrase par jour : l'accord du jour ne se
     * compose pas dans les trois langues.
     */
    readonly usualEvery: {
      readonly mon: string;
      readonly tue: string;
      readonly wed: string;
      readonly thu: string;
      readonly fri: string;
      readonly sat: string;
      readonly sun: string;
    };
    /** La raison d'un habituel sans jour qui revient (R1) — `{count}` vaut 3 au moins. */
    readonly usualOrdered: string;
    /** Le bref retour après un ajout au panier, quand il propose une suggestion (RS7). */
    readonly addedToCart: string;
    /**
     * À la place du « + » d'un article réservé à une opération datée, tant que
     * sa commande n'est pas ouverte (D8 de `architecture-operations-datees.md`).
     * `{date}` = le jour d'ouverture, court et localisé (« 15 nov. »).
     */
    readonly operationOpensOn: string;
    /** Le même, quand l'opération n'est pas (ou plus) servie avec la carte. */
    readonly operationNotOpen: string;
    /** À la place du « + » quand la commande de l'opération est close. */
    readonly operationClosed: string;
    /**
     * La pastille CALCULÉE d'une annonce liée à une opération (D11), quand la
     * vitrine n'en a pas saisi : annoncée, `{date}` = l'ouverture courte
     * (« 15 nov. ») ; ouverte, `{days}` = les jours calendaires de Paris
     * jusqu'à la clôture ; le jour même, {@link operationBadgeLastDay}. Close :
     * {@link operationClosed}.
     */
    readonly operationBadgeFrom: string;
    readonly operationBadgeDays: string;
    readonly operationBadgeLastDay: string;
    /**
     * L'encart qui ouvre le rayon d'une opération (plan
     * `plan-l-operation-passe-au-commerce.md`, « Une opération sans article ») :
     * ses dates dites en clair. `{date}` = un instant court, localisé, à
     * l'heure de Paris (« 15 nov. ») ; `{span}` = la période de retrait
     * ({@link product.operationPickupSpan} ou {@link product.operationPickupDay}).
     */
    readonly operationOrderFrom: string;
    readonly operationOrderUntil: string;
    /** La clôture avec son heure, quand l'opération la montre (`{date}`, `{time}` en HH:MM, heure de Paris). */
    readonly operationOrderUntilTime: string;
    readonly operationPickupWindow: string;
    /** Commandes ouvertes et rayon encore vide : l'encart le dit. */
    readonly operationAwaitingProducts: string;
  };
  readonly product: {
    /**
     * La pastille d'un article mis en avant (`isFeatured`, pour l'audience du
     * lecteur) — « les incontournables » (Hugo, 2026-10-18). La clé garde son
     * nom : une valeur n'est pas un nom.
     */
    readonly bestSeller: string;
    /** La ligne de fiche qui dit quand la pièce sort du four. */
    readonly oven: string;
    /** La ligne de fiche d'un article d'opération ouverte : ses jours de retrait. */
    readonly operationPickup: string;
    /** `{from}` et `{until}` = premier et dernier jours de retrait (« 20 », « 24 déc. »). */
    readonly operationPickupSpan: string;
    /** `{day}` = l'unique jour de retrait. */
    readonly operationPickupDay: string;
    readonly perPiece: string;
    /** `{pct}` = l'écart au tarif boutique, dérivé des deux montants, entier. */
    readonly proDiscount: string;
    /** `{n}` = la taille du lot proposé en raccourci. */
    readonly batch: string;
    readonly batchAria: string;
    /** `{n}` = la quantité du brouillon de la fiche. */
    readonly addCount: string;
    readonly update: string;
    readonly inCart: string;
    /** Le bouton de la fiche en visite pro : il ouvre la connexion au lieu d'ajouter. */
    readonly signInToOrder: string;
    /**
     * 🔴 La limite propre d'un article, plus stricte que la règle générale
     * (Hugo, 2026-10-21) — sur la fiche et sur la ligne du panier. `{n}` le
     * nombre de jours (deux et plus), `{time}` l'heure — « 12 h ».
     */
    readonly madeToOrderDays: string;
    /** La veille : `{time}` l'heure. */
    readonly madeToOrderEve: string;
    /** Le jour même : `{time}` l'heure. */
    readonly madeToOrderSameDay: string;
    /**
     * 🔴 La même limite, en COURT sur la vignette du rayon (Hugo, 2026-10-21) :
     * « Sur commande · 2 jours avant 12 h ». La phrase longue reste sur la
     * fiche. `{n}` et `{time}` comme au-dessus.
     */
    readonly madeToOrderShortDays: string;
    /** La veille, en court : `{time}`. */
    readonly madeToOrderShortEve: string;
    /** Le jour même, en court : `{time}`. */
    readonly madeToOrderShortSameDay: string;
  };
  readonly cart: {
    readonly kicker: string;
    readonly title: string;
    readonly intro: string;
    readonly pickupGroup: string;
    readonly deliveryGroup: string;
    /** `{day}` = la journée de service du serveur : « demain », « jeudi 17 septembre ». */
    readonly slotNote: string;
    /** La journée de service quand c'est aujourd'hui, puis demain — un mot plutôt qu'une date. */
    readonly dayToday: string;
    readonly dayTomorrow: string;
    /** Le lien du rappel de service : rouvre le mode ET l'heure, puis ramène au panier. */
    readonly changeService: string;
    readonly subtotal: string;
    /** `{at}` porte le complément du lieu, `{pct}` la remise. */
    readonly discount: string;
    /** La remise quand une ligne en est exclue : `{at}`, `{value}`, `{base}` (assiette, mention comprise). */
    readonly discountOnBase: string;
    /** Le renvoi de la marque `*` posée sur une ligne exclue de la remise. */
    readonly excludedNote: string;
    /** Le nom accessible d'une ligne exclue : `{name}`. */
    readonly excludedLineAria: string;
    readonly fee: string;
    /**
     * Sous la ligne de livraison : à quel taux le port est taxé (plan
     * `architecture-tva-des-frais-de-port.md`, V5). Le comptable le règle ; le client
     * doit pouvoir le relire sur ce qu'il paie.
     */
    readonly feeVatStandard: string;
    readonly feeVatProrata: string;
    /**
     * `{rate}` est remplacé par le taux réel. Une ligne par taux **présent** :
     * c'est ce qu'une facture porte, et la loi ne s'en contente pas d'un total.
     */
    readonly vat: string;
    readonly total: string;
    /**
     * Le total d'un pro **au compte**, hors taxe (F5, plan
     * `bons-et-facture-concordants`) : la TVA se calcule une fois sur la
     * facture du mois, un TTC par commande la contredirait.
     */
    readonly totalPretax: string;
    /** Sous ce total : où sont la TVA et le TTC. */
    readonly pretaxNote: string;
    /**
     * `{n}` = les points que la commande rapporterait (plan des points, E1.2).
     * La ligne n'existe que si le serveur en annonce plus de zéro.
     */
    readonly pointsToEarn: string;
    /**
     * Le choix d'un bon de fidélité au décompte (plan des points, E2.2) : son
     * libellé, l'option « aucun », et une option par bon (`{value}`, `{date}`).
     */
    readonly voucherPick: string;
    readonly voucherNone: string;
    readonly voucherOption: string;
    /** La ligne du décompte — son montant est la part HT imputée, rendue par le serveur. */
    readonly voucherLine: string;
    /** Le montant HT de la ligne du bon (`{value}`). */
    readonly voucherHt: string;
    /** Le reliquat d'un bon plus gros que le panier (`{value}`). */
    readonly voucherRemainder: string;
    /** La baisse de TTC que le bon obtient, en mention sous sa ligne (`{value}`). */
    readonly voucherEffect: string;
    /** La ligne d'une commande passée : la part HT imputée. */
    readonly voucherHtLine: string;
    /** La sortie du panier : tout retirer d'un coup. */
    readonly clear: string;
    /** Le second règlement : porter la commande au compte plutôt que payer. */
    readonly payOnAccount: string;
    /** ⚠️ Ce que l'écran répond tant que la condition de règlement ne l'atteint pas. */
    readonly accountSoon: string;
    /** `{name}` est remplacé par la pièce. La corbeille retire la LIGNE. */
    readonly dropAria: string;
    /** `{name}` est remplacé par la pièce. Le nom, lu seulement, du champ de quantité d'une ligne. */
    readonly quantityAria: string;
    /** `{total}` est remplacé par le montant dû. */
    readonly pay: string;
    readonly payHint: string;
    /**
     * Sous le bouton, quand le mode est choisi mais pas le créneau (un choix
     * posé avant le 2026-10-14) : pas de commande sans créneau, et la phrase
     * dit le geste qui débloque.
     */
    readonly slotMissing: string;
    /**
     * À la place du bouton de commande quand la boutique ne prend pas les
     * commandes de la clientèle de la personne (réglage « Ouverture de la
     * boutique », 2026-10-09). Le catalogue et les prix restent visibles.
     */
    readonly ordersClosed: string;
    /** Sous la fermeture : ce qui reste possible — le catalogue, le panier (2026-10-26). */
    readonly ordersClosedHint: string;
    /**
     * **La case des CGV au pied du panier** (Hugo, 2026-10-26) : la phrase
     * précède le lien, qui ouvre le texte de l'audience dans un nouvel onglet.
     * Elle n'apparaît que si un texte est publié pour cette clientèle.
     */
    readonly salesTermsAccept: string;
    /** Le lien de la case — le nom du document. */
    readonly salesTermsLink: string;
    /** Le texte a changé entre l'affichage et la commande (409) : relire, recocher. */
    readonly salesTermsOutdated: string;

    /**
     * **Le choix du règlement, au panier** — et il n'apparaît qu'à qui l'a
     * (Hugo, 2026-09-21).
     *
     * 🔴 Réservé aux sociétés à qui le mensuel a été ACCORDÉ (`grantedTerms`).
     * Un particulier n'a pas de société, donc pas de compte à débiter : lui
     * montrer ce choix serait lui proposer ce que le serveur refuserait, et le
     * contrat le dit — « le crédit se négocie, il ne se demande pas au panier ».
     *
     * ⚠️ Payer comptant reste TOUJOURS possible, y compris au mensuel : c'est
     * une facilité, pas une obligation, et régler tout de suite avec son propre
     * tarif est un droit. D'où deux actions et non un interrupteur.
     */
    readonly settleTitle: string;
    readonly settleCard: string;
    readonly settleAccount: string;
    /**
     * Le bouton d'un panier vide : il ferme le panneau (2026-10-09). Il disait
     * « Voir le rayon » et, ouvert depuis « Mes commandes », y ramenait.
     */
    readonly closeEmpty: string;
    readonly back: string;
    /**
     * L'invite qui remplace le règlement tant qu'on ne sait pas QUI commande.
     *
     * Elle ne paraît que pour un visiteur — jamais pendant que la session se
     * résout, sans quoi elle clignoterait devant un client déjà connecté.
     */
    readonly whoTitle: string;
    readonly whoHint: string;
    /** Le sur-titre de la porte de qui n'a pas de compte. */
    readonly whoRegister: string;
    /** Son bouton : commander sans créer de compte. */
    readonly whoGuestCta: string;
    /** Le sur-titre de la porte de qui en a un. */
    readonly whoSignIn: string;
    /** Son bouton : se connecter. */
    readonly whoSignInCta: string;
    readonly guestFirstName: string;
    /** Pourquoi le prénom suffit : c'est lui qu'on appelle au comptoir. */
    readonly guestFirstNameHint: string;
    readonly guestEmail: string;
    readonly guestEmailHint: string;
    /** Le second champ, celui qui empêche la faute de frappe. */
    readonly guestEmailAgain: string;
    /** Dit pendant la frappe, jamais au clic. */
    readonly guestEmailMismatch: string;
    readonly guestPhone: string;
    /** Le téléphone est requis : c'est le seul recours si l'adresse est fausse. */
    readonly guestPhoneHint: string;
    /** Les erreurs par champ (RGAA 11.10, lot A3) — un champ vide ne se dit qu'à l'envoi. */
    readonly guestFirstNameMissing: string;
    readonly guestEmailMissing: string;
    /** Pas d'arobase, ou rien après le point : le garde-fou de frappe, pas la règle du serveur. */
    readonly guestEmailInvalid: string;
    readonly guestEmailAgainMissing: string;
    readonly guestPhoneMissing: string;
    /**
     * Sous le bouton de règlement, ce qui manque encore (RGAA 11.10/11.11,
     * lot A3) : relié au bouton, il dit pourquoi il ne mène nulle part.
     */
    readonly payBlockedIdentity: string;
    readonly payBlockedSignIn: string;
    readonly payBlockedTerms: string;
    readonly payBlockedTermsLoading: string;
    /** Le refus du serveur à la passation, quand il n'a pas de message sûr à dire. */
    readonly placeFailed: string;
  };
  /** L'écran du **QR de retrait** — celui que le client présente au comptoir. */
  readonly qr: {
    readonly title: string;
    readonly lead: string;
    readonly loading: string;
    /** Ce que dit un lecteur d'écran devant le carré — on décrit l'objet. */
    readonly codeLabel: string;
    /** `{day}` est remplacé par la journée d'acheminement. */
    readonly when: string;
    /** Déjà remise, ou origine admin non configurée : aucun code à montrer. */
    readonly unavailable: string;
    /** Commande introuvable — ou celle d'un autre : on ne distingue pas. */
    readonly unknown: string;
    /**
     * Commande carte pas encore réglée : pas de code avant le paiement
     * (plan `commande-carte-reglee.md`, 2026-10-09).
     */
    readonly due: string;
  };

  /** L'écran de RÈGLEMENT — une étape, entre le panier et la confirmation. */
  readonly pay: {
    readonly title: string;
    /** `{ref}` est remplacé par le numéro de commande rendu par le serveur. */
    readonly lead: string;
    readonly amount: string;
    readonly loading: string;
    /** `{total}` est remplacé par le montant dû. */
    readonly submit: string;
    readonly submitting: string;
    /**
     * **La sortie sans payer : un ABANDON, et le libellé le dit.**
     *
     * 🔴 Elle s'est appelée « Régler plus tard » (jusqu'au 2026-09-21), puis
     * « Je règle depuis « Mes commandes » » (jusqu'au 2026-09-26) : deux
     * promesses de délai pour un geste qui ne marquait rien. Rien dans « Mes
     * commandes » ne menait au règlement. Depuis le lot 8 du plan
     * `documentation/commandes/reglement/architecture-abandon-du-reglement.md`, elle TENTE
     * `POST /orders/:id/abandon` et navigue quoi qu'il arrive.
     */
    readonly abandon: string;
    /** La conséquence, dite AVANT d'agir — particulier : l'intention meurt. */
    readonly abandonWarning: string;
    /** La même, pour un pro : l'intention vit jusqu'à la clôture (Q8, a). */
    readonly abandonWarningPro: string;
    readonly abandonConfirm: string;
    readonly abandonKeep: string;
    /** Le bouton de confirmation pendant l'appel. */
    readonly abandonBusy: string;
    /** 204, particulier : annulée, rien débité. */
    readonly abandoned: string;
    /**
     * Rien n'est annulé MAINTENANT — pro (204), Stripe injoignable, réseau,
     * visiteur : la clôture de la journée balaiera la commande non réglée.
     */
    readonly abandonPending: string;
    /** 409 `already_paid` / `payment_in_progress` : jamais « annulée ». */
    readonly abandonSettled: string;
    /** La commande ne se règle plus en ligne : réglée, au compte, annulée, ou intention close. */
    readonly closed: string;
    readonly closedAction: string;
    /** Le module de paiement ne s'est pas chargé — la commande, elle, existe. */
    readonly unavailable: string;
    /** Repli quand Stripe refuse sans message ; sinon c'est le SIEN qu'on montre. */
    readonly refused: string;
    /** Ni accepté ni refusé : l'intention n'a pas abouti. */
    readonly failed: string;
    readonly accepted: string;
  };
  readonly done: {
    readonly kicker: string;
    /** Le titre quand la commande est RÉGLÉE. Deux lignes, séparées par `\n`. */
    readonly title: string;
    /** Quand elle reste à régler — l'écran ne dit pas « c'est réglé ». */
    readonly titleDue: string;
    /** Quand rien n'est à encaisser : elle part au compte de la société. */
    readonly titleAccount: string;
    readonly intro: string;
    /**
     * Où RETROUVER la commande.
     *
     * 🔴 Ces deux lignes annonçaient « Reçu envoyé par e-mail — la facture et le
     * QR de retrait sont dedans ». Aucun e-mail de commande n'existe (le mailer
     * n'a pas de gabarit `customer.order-*`, et rien n'écoute `OrderPlacedEvent`
     * pour écrire), et aucune facture n'est émise. Elles disent maintenant ce
     * qui est vrai : la commande est en ligne, et voilà où.
     */
    readonly keptTitle: string;
    readonly keptLine: string;
    /** Un visiteur : son QR est dans le courriel, il n'a pas d'espace. */
    readonly guestMailTitle: string;
    readonly guestMailLine: string;
    /** L'invitation à créer un compte, sous la confirmation d'un visiteur. */
    readonly joinTitle: string;
    readonly joinLine: string;
    /**
     * Remplacent `joinLine` quand le serveur a chiffré les points de cette
     * commande et/ou le bonus de bienvenue (plan bienvenue, lot D). Au FUTUR :
     * le compte créé avec cette adresse reprend la commande. `{bonus}` et
     * `{points}` sont des nombres formatés, `{when}` vaut `joinOnceHandedOver`
     * ou `joinOnceSettledAndHandedOver`.
     */
    readonly joinBonusAndPoints: string;
    readonly joinPointsOnly: string;
    readonly joinBonusOnly: string;
    /** Les points ne sont crédités qu'à une commande retirée ET payée. */
    readonly joinOnceHandedOver: string;
    readonly joinOnceSettledAndHandedOver: string;
    readonly joinAction: string;
    readonly recapPickup: string;
    readonly recapDelivery: string;
    readonly recapContent: string;
    /** `{count}` est remplacé par le nombre de pièces. */
    readonly recapPieces: string;
    readonly paidOnline: string;
    /** La ligne de total quand le règlement reste dû. */
    readonly toSettle: string;
    /** La ligne de total quand la commande est portée au compte. */
    readonly onAccount: string;
    /** La même, hors taxe : un pro au compte ne lit que le HT (F5). */
    readonly onAccountPretax: string;
    /** Le bouton qui ramène à l'étape de règlement. */
    readonly settleAction: string;
    readonly qr: string;
    /**
     * Ce qu'il faut faire pour CHANGER quelque chose.
     *
     * 🔴 Il y avait ici deux boutons — « Modifier », « Annuler » — et la phrase
     * « Modifiable jusqu'à 22 h — remboursement immédiat ». Aucune route ne
     * modifie, n'annule ni ne rembourse une commande : `cancelled` et `refunded`
     * ne sont écrits nulle part. Les boutons répondaient « cet écran arrive au
     * prochain lot » ; la phrase, elle, ne répondait rien du tout.
     *
     * La commande est un fait clos, et ce qui bouge après passe par un avenant
     * — qui n'existe pas encore. Tant qu'il n'existe pas, la seule chose vraie à
     * dire est par où passe un changement.
     */
    readonly changeNote: string;
  };
  readonly dialog: {
    readonly close: string;
  };
  readonly pickupDialog: {
    readonly kicker: string;
    readonly title: string;
    /** Le titre du second volet, celui de l'heure. */
    readonly whenTitle: string;
    /** `{value}` est remplacé par la remise du meilleur point. */
    readonly lead: string;
    readonly habit: string;
    /** `{time}` est remplacé par l'heure de mise à disposition. */
    readonly readyFrom: string;
    /** `{value}` est remplacé par la remise du point : « 10 % » ou « 2,00 € ». */
    readonly discountTag: string;
    /** `{value}` : la remise d'un point qui ne couvre qu'une partie du catalogue. */
    readonly discountTagSelection: string;
    /**
     * La ligne d'un point SANS remise pour un pro (société active) : il y paie
     * le tarif pro, rien de moins.
     */
    readonly proPrice: string;
    /**
     * La même ligne pour un particulier — visiteur, perso ou société non
     * active : il y paie le prix de la boutique (Hugo, 2026-09-15). « Prix
     * pro » lui promettrait un tarif qui n'est pas le sien.
     */
    readonly shopPrice: string;
    readonly cta: string;
  };
  readonly addressDialog: {
    readonly kicker: string;
    readonly title: string;
    readonly bookGroup: string;
    readonly defaultTag: string;
    readonly otherGroup: string;
    readonly street: string;
    readonly streetPlaceholder: string;
    readonly postcode: string;
    readonly postcodePlaceholder: string;
    readonly city: string;
    readonly cityUnknown: string;
    readonly outOfZone: string;
    readonly outOfZoneNote: string;
    readonly whoGroup: string;
    readonly name: string;
    readonly fromAccount: string;
    readonly phone: string;
    readonly edit: string;
    readonly whyPhone: string;
    readonly saveToBook: string;
    readonly saveOn: string;
    readonly saveOff: string;
    /** `{fee}` est remplacé par le tarif de la zone. */
    readonly cta: string;
    readonly ctaBlocked: string;
  };
  readonly slotStep: {
    /** `{place}` est remplacé par le point de retrait ou l'adresse. */
    readonly pickupIntro: string;
    readonly deliveryIntro: string;
    readonly amGroup: string;
    readonly pmGroup: string;
    /** Sous-titre d'un créneau ouvert à tous. */
    readonly free: string;
    /**
     * Sous-titre d'un créneau que le PUBLIC n'a pas — la fenêtre réservée du
     * point. C'est la seule restriction que le système sache lire ; « complet »
     * et « sortie du four » ont disparu avec la grille en dur, faute de source.
     */
    readonly proOnly: string;
    /** « avant 8 h » — la fenêtre d'un point qui n'a pas déclaré son ouverture. */
    readonly before: string;
    readonly noneTitle: string;
    readonly noneSubtitle: string;
    readonly ctaIdle: string;
    /** Le créneau tenu, on va composer : le bouton nomme la SUITE. */
    readonly cta: string;
  };
  /**
   * Les trois écrans du dossier client. Leur copie vit à côté de leur écran et
   * pas ici : sept cartes, un registre et un tableau font, à eux trois, plus de
   * phrases que tout le reste de l'app réuni. Le garde-fou ne bouge pas — les
   * trois langues restent obligatoires, chacune sur son interface.
   */
  readonly orders: OrdersCopy;
  readonly loyalty: LoyaltyCopy;
  readonly account: AccountCopy;

  readonly pro: {
    readonly title: string;
    readonly bookedTitle: string;
    readonly pitch: string;
    readonly cta: string;
    /** Le lien vers la porte pro, sous le rappel. */
    readonly openAccount: string;
    /** `{slot}` est remplacé par le créneau retenu. */
    readonly booked: string;
    readonly at: string;
    readonly cancel: string;
  };

  /**
   * Le dialogue d'une **mention légale**, ouvert depuis le pied de page — les
   * cinq le partagent, parce qu'elles ont la même forme. Ces phrases parlent
   * donc du « document » et jamais des CGV : elles servent aussi bien aux
   * cookies qu'à l'accessibilité.
   *
   * Le TITRE du document n'est pas ici : il vient de l'API, dans les trois
   * langues, et c'est lui qui nomme le dialogue. Le libellé du LIEN, lui, vient
   * du contrat (`legalMentionLabels`) : la barre nomme l'obligation, le
   * document se nomme lui-même.
   */
  readonly legalDocument: {
    /** Le nom accessible du bouton de fermeture du panneau. */
    readonly close: string;
    readonly loading: string;
    readonly errorTitle: string;
    readonly errorSubtitle: string;
    readonly retry: string;
    readonly emptyTitle: string;
    readonly emptySubtitle: string;
    /**
     * Les **CGV**, lues dans le dialogue du pied de page comme sur `/cgv` (plan
     * `legal/plan-cgv-par-audience.md`, bandeau du 2026-10-15) : un switch
     * Particulier / Pro, le PDF de référence du côté affiché, et l'état des CGV
     * pro pas encore rédigées — jamais le texte particulier à leur place.
     */
    readonly salesTerms: {
      /** Le titre de la page `/cgv` et son mot dans le bandeau. */
      readonly pageTitle: string;
      /** Le nom accessible du switch. */
      readonly sideLabel: string;
      readonly sideParticulier: string;
      readonly sidePro: string;
      readonly downloadPdf: string;
      readonly pdfReference: string;
      /** Le titre de l'état vide côté pro : un texte pas encore rédigé, pas une panne. */
      readonly proDraftTitle: string;
    };
  };
}
