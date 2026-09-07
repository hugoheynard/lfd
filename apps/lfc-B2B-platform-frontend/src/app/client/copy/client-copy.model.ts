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
    readonly back: string;
    readonly menu: string;
    readonly notifications: string;
    readonly lang: string;
    readonly kickerWelcome: string;
    readonly kickerRappel: string;
    readonly kickerCommande: string;
    readonly kickerShop: string;
    readonly kickerCart: string;
    readonly kickerPay: string;
    readonly kickerQr: string;
    readonly kickerDone: string;
    readonly deskKicker: string;
  };

  readonly nav: {
    /** Les six destinations, dans l'ordre — cf. `ClientNav`. */
    readonly destinations: {
      readonly espace: string;
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
  readonly espace: {
    /** La seconde ligne du titre, indexée par le NOMBRE d'actions (1, 2, 3). */
    readonly today: readonly [string, string, string];
    /** Quand rien n'attend — le titre ne compte plus, il accueille. */
    readonly todayNone: string;
    /** Ce que sont ces choses, en une ligne. */
    readonly lead: string;
    readonly leadNone: string;
    /** L'action de la carte d'opération datée. */
    readonly eventCta: string;
    readonly wellTitle: string;
    readonly wellNote: string;
    readonly pickupTitle: string;
    /** `{ref}` est remplacé par le numéro de commande. */
    readonly pickupRef: string;
    /**
     * `{at}` le LIEU tel que la commande l'a figé, `{slot}` la tranche.
     *
     * 🔴 `{at}` portait une forme prépositionnelle — « au Labo » — que seul le
     * choix de service local savait fabriquer. La carte lit désormais la
     * commande du SERVEUR, qui ne connaît que « Le Labo » : la préposition est
     * passée dans la phrase, où elle est traduisible.
     */
    readonly pickupWhen: string;
    readonly pickupAction: string;
    readonly cartTitle: string;
    readonly cartBadge: string;
    readonly cartWhen: string;
    readonly cartAction: string;
    readonly invoiceTitle: string;
    readonly invoiceDue: string;
    readonly invoiceAction: string;
    readonly contactKicker: string;
    readonly contactTitle: string;
    readonly contactWho: string;
    readonly call: string;
    readonly write: string;
    readonly habitsHead: string;
    readonly proHead: string;
    readonly proDiscount: string;
    readonly proMonth: string;
    readonly proKbis: string;
    readonly proKbisState: string;
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
    readonly eyebrow: string;
    readonly alreadyLead: string;
    readonly alreadyLink: string;
    readonly pitch: string;
    readonly firstName: string;
    readonly firstNamePlaceholder: string;
    readonly tel: string;
    readonly telPlaceholder: string;
    readonly telHint: string;
    readonly email: string;
    readonly emailPlaceholder: string;
    readonly open: string;
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
    readonly learnMore: string;
    readonly emptyTitle: string;
    readonly emptyHint: string;
    readonly shelvesGroup: string;
    readonly add: string;
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
    /** `{name}` est remplacé par le nom de la pièce. */
    readonly addAria: string;
    readonly removeAria: string;
    /** `{count}` est remplacé par le nombre de pièces au panier. */
    readonly cartBar: string;
    readonly cartTitle: string;
    readonly cartEmpty: string;
    /** `{name}` est remplacé par la gourmandise proposée. */
    readonly upsell: string;
    readonly upsellLine: string;
  };
  readonly product: {
    readonly signature: string;
    readonly unitPrice: string;
    readonly oven: string;
    readonly pickupAt: string;
    readonly deliverTo: string;
    /** `{price}` est remplacé par le prix de ce qui est au stepper. */
    readonly cta: string;
  };
  readonly cart: {
    readonly kicker: string;
    readonly title: string;
    readonly intro: string;
    readonly pickupGroup: string;
    readonly deliveryGroup: string;
    readonly slotNote: string;
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
    readonly browse: string;
    readonly back: string;
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
    /** Une commande en coursier n'a pas de comptoir, donc pas de code. */
    readonly delivery: string;
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
    /** `{pct}` est remplacé par la remise du meilleur point. */
    readonly lead: string;
    readonly habit: string;
    /** `{time}` est remplacé par l'heure de mise à disposition. */
    readonly readyFrom: string;
    /** `{pct}` est remplacé par la remise du point. */
    readonly discountTag: string;
    readonly shopPrice: string;
    readonly cta: string;
    /** `{pct}` est remplacé par la remise retenue. */
    readonly ctaDiscount: string;
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
    /** `{slot}` est remplacé par le créneau retenu. */
    readonly booked: string;
    readonly at: string;
    readonly cancel: string;
  };
}
