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
    readonly kickerDone: string;
    readonly deskKicker: string;
  };
  readonly foot: {
    readonly place: string;
    readonly hours: string;
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
    readonly searchPlaceholder: string;
    readonly clearSearch: string;
    readonly allShelves: string;
    readonly allShelvesTitle: string;
    /** `{query}` est remplacé par ce qui a été cherché. */
    readonly resultsFor: string;
    /** `{count}` est remplacé par le nombre de références montrées. */
    readonly pieces: string;
    readonly learnMore: string;
    readonly emptyTitle: string;
    readonly emptyHint: string;
    readonly shelvesGroup: string;
    readonly add: string;
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
    /** `{rate}` est remplacé par le taux réel. */
    readonly vat: string;
    readonly vatSweet: string;
    readonly vatSale: string;
    readonly total: string;
    /** `{total}` est remplacé par le montant dû. */
    readonly pay: string;
    readonly payHint: string;
    readonly browse: string;
    readonly back: string;
  };
  readonly done: {
    readonly kicker: string;
    readonly title: string;
    readonly intro: string;
    readonly mailTitle: string;
    /** `{email}` est remplacé par l'adresse du compte. */
    readonly mailLine: string;
    readonly recapPickup: string;
    readonly recapDelivery: string;
    readonly recapContent: string;
    /** `{count}` est remplacé par le nombre de pièces. */
    readonly recapPieces: string;
    readonly paidOnline: string;
    readonly qr: string;
    readonly edit: string;
    readonly cancel: string;
    readonly deadline: string;
    readonly pending: string;
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
    readonly firstBatch: string;
    readonly free: string;
    readonly full: string;
    readonly secondBatch: string;
    readonly laboOnly: string;
    readonly ctaIdle: string;
    /** Le créneau tenu, on va composer : le bouton nomme la SUITE. */
    readonly cta: string;
  };
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
