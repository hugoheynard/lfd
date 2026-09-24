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
import type { InvoicesCopy } from './screens/invoices.copy';
import type { OrdersCopy } from './screens/orders.copy';

export interface ClientCopy {
  readonly chrome: {
    /** L'avis après une connexion Google refusée : un compte porte déjà l'adresse. */
    readonly identityConflict: string;
    readonly identityConflictDismiss: string;
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
    /**
     * Ce que dit l'app quand elle n'a pas pu lire ce que la boutique permet.
     * Elle se comporte alors comme fermée : la phrase dit pourquoi des écrans
     * manquent, et comment réessayer.
     */
    readonly featureAccessFailed: string;
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
  };

  readonly nav: {
    /** Les six destinations, dans l'ordre — cf. `ClientNav`. */
    readonly destinations: {
      readonly shop: string;
      readonly orders: string;
      readonly invoices: string;
      readonly baskets: string;
      readonly account: string;
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
    /** L'action du dialogue — elle mène à l'écran d'Auth0, elle ne connecte pas. */
    readonly signInSubmit: string;

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
    /** Les trois états du chargement de la vitrine — cf. `ShopCatalogue`. */
    readonly loading: string;
    readonly loadFailedTitle: string;
    readonly loadFailedHint: string;
    readonly loadRetry: string;
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
    /** `{name}` est remplacé par le nom de la pièce. */
    readonly addAria: string;
    readonly removeAria: string;
    /** `{count}` est remplacé par le nombre de pièces au panier. */
    readonly cartTitle: string;
    readonly cartEmpty: string;
    /** `{name}` est remplacé par la gourmandise proposée. */
    readonly upsell: string;
    readonly upsellLine: string;
    /**
     * À la place du geste d'ajout, quand la boutique se VISITE sans encore
     * permettre de commander (niveau `browse`). Pas de date : rien dans le
     * système n'en porte une.
     */
    readonly orderingSoon: string;
  };
  readonly product: {
    /** La pastille d'un article mis en avant (`isFeatured`). */
    readonly bestSeller: string;
    /** La ligne de fiche qui dit quand la pièce sort du four. */
    readonly oven: string;
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
    readonly fee: string;
    /**
     * `{rate}` est remplacé par le taux réel. Une ligne par taux **présent** :
     * c'est ce qu'une facture porte, et la loi ne s'en contente pas d'un total.
     */
    readonly vat: string;
    readonly total: string;
    /** La sortie du panier : tout retirer d'un coup. */
    readonly clear: string;
    /** Le second règlement : porter la commande au compte plutôt que payer. */
    readonly payOnAccount: string;
    /** ⚠️ Ce que l'écran répond tant que la condition de règlement ne l'atteint pas. */
    readonly accountSoon: string;
    /** `{name}` est remplacé par la pièce. La corbeille retire la LIGNE. */
    readonly dropAria: string;
    /** `{total}` est remplacé par le montant dû. */
    readonly pay: string;
    readonly payHint: string;

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
    readonly browse: string;
    readonly back: string;
    /**
     * L'invite qui remplace le règlement tant qu'on ne sait pas QUI commande.
     *
     * Elle ne paraît que pour un visiteur — jamais pendant que la session se
     * résout, sans quoi elle clignoterait devant un client déjà connecté.
     */
    readonly whoTitle: string;
    readonly whoHint: string;
    /** La porte de qui n'a pas de compte. */
    readonly whoRegister: string;
    /** La porte de qui en a un. */
    readonly whoSignIn: string;
    /**
     * **La saisie d'un visiteur sans compte** — le dialogue « Qui commande ? ».
     *
     * L'adresse s'y écrit DEUX fois, et ce n'est pas de la cérémonie : le QR de
     * retrait part par courriel, et un visiteur n'a pas d'espace où le
     * retrouver. C'est la seule barrière avant un envoi irréversible.
     */
    readonly guestTitle: string;
    readonly guestSubtitle: string;
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
    readonly guestCancel: string;
    readonly guestConfirm: string;
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
     * **La sortie sans payer.**
     *
     * 🔴 Elle s'appelait « Régler plus tard » jusqu'au 2026-09-21 (Hugo : « ça
     * n'arrive jamais »), et c'était une promesse fausse. On n'atteint cet
     * écran que quand le serveur a répondu `due`, c'est-à-dire quand la CARTE
     * est requise : rien n'a été différé. Le vrai différé, c'est « au compte »,
     * et il ne passe jamais par ici.
     *
     * ⚠️ Le geste, lui, reste bon : la commande est écrite, son adresse de
     * règlement se rouvre. Le libellé dit donc D'OÙ on revient la payer, au
     * lieu de laisser croire à un délai accordé.
     */
    readonly later: string;
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
  readonly invoices: InvoicesCopy;
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
  };
}
