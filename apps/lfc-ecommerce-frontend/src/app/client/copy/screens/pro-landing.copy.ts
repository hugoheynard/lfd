import type { LocaleCode } from '../../client-locale.service';

/** Une façon d'être servi, dite à un pro qui n'a pas encore de compte. */
export interface ProLandingModeCopy {
  readonly tag: string;
  /** La COUPE vient du dictionnaire (`\n`) : une traduction n'a pas à connaître le HTML. */
  readonly title: string;
  readonly intro: string;
  /** La pastille au pied de la carte — ce que le contrat fixe. */
  readonly note: string;
  /** Le nom de la carte pour un lecteur d'écran : elle ouvre la connexion. */
  readonly signInLabel: string;
}

/**
 * Ce que la carte du retrait ajoute quand les points ouverts aux pros sont
 * lus. Échec ou liste vide : la carte garde ses mots génériques.
 */
export interface ProLandingPickupPointsCopy {
  readonly loading: string;
  /** `{count}` — plusieurs points. */
  readonly many: string;
  /** `{place}` — un seul point. */
  readonly one: string;
  /** `{value}` — la meilleure remise pro, déjà formatée. */
  readonly discount: string;
}

/**
 * Les incontournables pros, sans prix : la section n'existe que si la liste
 * publique en rend au moins un.
 */
export interface ProLandingFeaturedCopy {
  readonly title: string;
  readonly loading: string;
  /** `{name}` — le nom de la carte : elle ouvre la connexion, le tarif pro demandant un compte. */
  readonly signInLabel: string;
}

/**
 * **Ce que dit l'accueil pro public** (`/pro`) — la page vers laquelle l'agence
 * web envoie un professionnel qui n'est pas connecté (Hugo, 2026-10-19).
 *
 * 🔴 Les deux modes sont dits de façon GÉNÉRIQUE : un visiteur n'a ni statut,
 * ni points de retrait, ni créneaux. Les portes de `/bienvenue` sont remplies
 * selon le compte connecté ; ici rien n'est lu, tout est écrit.
 */
export interface ProLandingCopy {
  readonly kicker: string;
  readonly title: string;
  readonly lede: string;
  readonly pills: readonly string[];
  /** L'accent : celui qui a déjà un compte entre d'abord. */
  readonly signInLead: string;
  /** Ce qu'on retrouve en se connectant. */
  readonly signInPitch: string;
  readonly signIn: string;
  readonly register: string;
  readonly modesTitle: string;
  readonly pickup: ProLandingModeCopy;
  readonly delivery: ProLandingModeCopy;
  readonly pickupPoints: ProLandingPickupPointsCopy;
  readonly featured: ProLandingFeaturedCopy;
  /** Le grand appel sous les deux modes : voir le rayon avant d'ouvrir un compte. */
  readonly browse: string;
  /** Le libellé du contact, à plat à gauche de « Je visite la boutique ». */
  readonly contact: string;
}

export const PRO_LANDING_FR: ProLandingCopy = {
  kicker: 'Espace professionnel',
  title: 'Votre boulangerie\nen station.',
  lede: 'Hôtels, restaurants, chalets : commandez au prix pro, retirez au point convenu ou faites-vous livrer sur les créneaux de votre contrat.',
  pills: ['Tarifs pro', 'Livraison en station', 'Facturation mensuelle'],
  signInLead: 'Déjà inscrit ?',
  signInPitch: 'Retrouvez vos commandes, vos paniers récurrents et vos factures.',
  signIn: 'Je me connecte',
  register: 'Ouvrir un compte pro',
  modesTitle: 'Deux façons d’être servi',
  pickup: {
    tag: 'Retrait',
    title: 'Je passe\nla prendre',
    intro: 'Au point de retrait convenu avec votre commercial, prête à l’heure choisie.',
    note: 'Point convenu',
    signInLabel: 'Se connecter pour commander en retrait',
  },
  delivery: {
    tag: 'Livraison',
    title: 'On vous\nl’apporte',
    intro: 'Livrée à votre établissement, sur les créneaux fixés par votre contrat.',
    note: 'Sous contrat',
    signInLabel: 'Se connecter pour commander en livraison',
  },
  pickupPoints: {
    loading: 'Points de retrait…',
    many: '{count} points de retrait',
    one: 'Je retire à {place}',
    discount: 'Jusqu’à −{value}',
  },
  featured: {
    title: 'Nos incontournables',
    loading: 'Incontournables…',
    signInLabel: 'Se connecter pour voir le tarif de {name}',
  },
  browse: 'Je visite la boutique',
  contact: 'Nous contacter',
};

export const PRO_LANDING_EN: ProLandingCopy = {
  kicker: 'Trade customers',
  title: 'Your bakery\nin the resort.',
  lede: 'Hotels, restaurants, chalets: order at trade prices, collect at the agreed point or get deliveries on the slots of your contract.',
  pills: ['Trade prices', 'Delivery in resort', 'Monthly invoicing'],
  signInLead: 'Already registered?',
  signInPitch: 'Find your orders, recurring baskets and invoices.',
  signIn: 'Sign in',
  register: 'Open a trade account',
  modesTitle: 'Two ways to be served',
  pickup: {
    tag: 'Pickup',
    title: 'I’ll come\nand get it',
    intro: 'At the pickup point agreed with your sales contact, ready at the time you choose.',
    note: 'Agreed point',
    signInLabel: 'Sign in to order for pickup',
  },
  delivery: {
    tag: 'Delivery',
    title: 'We bring\nit to you',
    intro: 'Delivered to your venue, on the slots set by your contract.',
    note: 'Under contract',
    signInLabel: 'Sign in to order for delivery',
  },
  pickupPoints: {
    loading: 'Pickup points…',
    many: '{count} pickup points',
    one: 'I collect at {place}',
    discount: 'Up to −{value}',
  },
  featured: {
    title: 'Our must-haves',
    loading: 'Must-haves…',
    signInLabel: 'Sign in to see the price of {name}',
  },
  browse: 'Browse the shop',
  contact: 'Contact us',
};

export const PRO_LANDING_IT: ProLandingCopy = {
  kicker: 'Spazio professionisti',
  title: 'La vostra panetteria\nin stazione.',
  lede: 'Hotel, ristoranti, chalet: ordinate a prezzi pro, ritirate al punto concordato o ricevete le consegne negli orari del vostro contratto.',
  pills: ['Prezzi pro', 'Consegna in stazione', 'Fatturazione mensile'],
  signInLead: 'Già registrati?',
  signInPitch: 'Ritrovate i vostri ordini, i carrelli ricorrenti e le fatture.',
  signIn: 'Accedo',
  register: 'Aprire un conto pro',
  modesTitle: 'Due modi di essere serviti',
  pickup: {
    tag: 'Ritiro',
    title: 'Passo\na prenderlo',
    intro: 'Al punto di ritiro concordato con il vostro commerciale, pronto all’ora scelta.',
    note: 'Punto concordato',
    signInLabel: 'Accedi per ordinare con ritiro',
  },
  delivery: {
    tag: 'Consegna',
    title: 'Ve lo\nportiamo noi',
    intro: 'Consegnato al vostro locale, negli orari fissati dal contratto.',
    note: 'Su contratto',
    signInLabel: 'Accedi per ordinare con consegna',
  },
  pickupPoints: {
    loading: 'Punti di ritiro…',
    many: '{count} punti di ritiro',
    one: 'Ritiro a {place}',
    discount: 'Fino a −{value}',
  },
  featured: {
    title: 'I nostri imperdibili',
    loading: 'Imperdibili…',
    signInLabel: 'Accedi per vedere il prezzo di {name}',
  },
  browse: 'Visito il negozio',
  contact: 'Contattaci',
};

const DICTIONARIES: Readonly<Record<LocaleCode, ProLandingCopy>> = {
  fr: PRO_LANDING_FR,
  en: PRO_LANDING_EN,
  it: PRO_LANDING_IT,
};

/** Le dictionnaire de la langue choisie. */
export function proLandingCopy(locale: LocaleCode): ProLandingCopy {
  return DICTIONARIES[locale];
}
