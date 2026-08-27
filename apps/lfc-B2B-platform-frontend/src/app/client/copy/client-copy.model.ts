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
    readonly kickerLogin: string;
    readonly kickerEntered: string;
    readonly kickerRappel: string;
    readonly kickerCommande: string;
    readonly deskKicker: string;
  };
  readonly foot: {
    readonly place: string;
    readonly hours: string;
  };
  readonly hero: {
    readonly welcomeTitle: string;
    readonly welcomeIntro: string;
    readonly loginTitle: string;
    readonly loginIntroAsk: string;
    readonly loginIntroSent: string;
    readonly enteredTitle: string;
    readonly enteredIntro: string;
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
  readonly login: {
    readonly email: string;
    readonly emailPlaceholder: string;
    readonly send: string;
    readonly fine: string;
    readonly sentTitle: string;
    /** `{email}` est remplacé par l'adresse saisie. */
    readonly sentBody: string;
    readonly simulate: string;
    readonly resent: string;
    readonly resend: string;
    readonly editEmail: string;
  };
  readonly entered: {
    readonly title: string;
    readonly sub: string;
    readonly next: string;
    readonly cta: string;
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
    readonly deliveryBadge: string;
    /** Deux lignes, séparées par un retour. */
    readonly deliveryTitle: string;
    readonly deliveryDetail: string;
    readonly deliveryNote: string;
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
    readonly qrTitle: string;
    /** `{order}` est remplacé par le numéro de commande. */
    readonly qrSub: string;
    readonly qrAction: string;
    readonly againTitle: string;
    readonly againSub: string;
    readonly againAction: string;
    readonly urgenceTitle: string;
    readonly urgencePitch: string;
    readonly urgenceCta: string;
    readonly pending: string;
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
