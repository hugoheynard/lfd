import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit l'accueil public** — l'écran d'un visiteur qui arrive sans
 * compte (dossier `handoff-bienvenue`).
 *
 * 🔴 Les trois verbes — commander, retirer, déguster — vivent dans le TITRE et
 * dans le rail des étapes, **jamais** en triptyque de cartes à icônes : il a été
 * essayé puis retiré, personne ne lit trois cartes d'argumentaire sous un hero.
 *
 * Le visiteur ne lit pas un argumentaire : il répond à des questions dont
 * chaque réponse lui rapporte quelque chose. D'où des libellés qui NOMMENT le
 * gain — une remise, une fournée — plutôt que de vanter la maison.
 *
 * ⚠️ Les libellés de l'OFFRE d'un point (« −10 % sur tout », « Prix boutique »)
 * ne sont PAS ici : ils vivent dans `pickupDialog` de `ClientCopy`, et la carte
 * les lit par `pickupOffer`. Deux jeux de mots pour la même pastille, et la
 * carte finirait par contredire le dialogue — c'est arrivé sur un pourcentage
 * le 2026-09-15.
 */
export interface AccueilPublicCopy {
  /** Le sur-titre de la barre, pour un visiteur qui doit savoir où il est. */
  readonly kicker: string;

  /**
   * Le titre de l'écran, sur l'encre, au-dessus du rail des étapes.
   *
   * 🔴 C'est ICI que vivent les trois verbes — avec le rail, et nulle part
   * ailleurs. Les retours à la ligne viennent du dictionnaire et non d'une
   * balise : une traduction n'a pas à connaître le HTML, et l'italien n'a pas
   * la même coupe que le français.
   */
  readonly screenTitle: string;

  readonly hero: {
    /** La pastille du bandeau. */
    readonly tag: string;
    /** Le titre, en capitales — le plus gros objet de la page. */
    readonly title: string;
    /** La ligne qui dit ce qui vient après, et que la remise est automatique. */
    readonly intro: string;
  };

  /**
   * Les preuves, sous un filet. Trois faits courts, pas des arguments.
   * `{value}` de `discount` est remplacé par la meilleure remise réelle ; sans
   * remise, la preuve disparaît plutôt que d'annoncer un zéro.
   */
  readonly proof: {
    readonly discount: string;
    readonly discountLabel: string;
    /**
     * Sous la plus matinale des ouvertures déclarées.
     *
     * ⚠️ Il dit « ouverture » et NON « premier créneau », que la maquette
     * écrivait — et la raison a CHANGÉ le 2026-09-17. Elle était qu'aucune
     * surface publique ne servait les créneaux ; il en existe une depuis
     * (`GET /pickup-addresses/:id/creneaux`, et le sélecteur d'heure la lit).
     * Ce qui tient toujours, c'est la donnée affichée : cette valeur vient de
     * `publicOpening.start`, l'heure à laquelle la maison OUVRE, et non du
     * premier créneau réservable — qui dépend du jour, des fermetures et de
     * l'heure qu'il est. Les nommer pareil ferait annoncer un créneau qu'on
     * n'a pas calculé.
     */
    readonly opensLabel: string;
  };

  /** Le rail des trois étapes — l'argumentaire, et l'endroit où l'on se situe. */

  readonly houses: {
    /** Dérivé de la comparaison des remises, jamais saisi. */
    readonly best: string;
    /** L'appel d'une maison ouverte. */
    readonly choose: string;
    /** Une maison qui ne prend pas de commande — le refus PRÉCÈDE l'effort. */
    readonly closed: string;
    readonly closedHint: string;
    /** Le compte du rail, sous les puces. */
    readonly count: string;
    readonly scroll: string;
  };

  /**
   * La sortie : on peut voir la boutique sans avoir choisi sa maison.
   * Demander le lieu avant d'avoir montré un croissant serait un péage.
   */
  readonly browse: {
    /** Ce que la pastille « ? » annonce aux lecteurs d'écran. */
    readonly helpLabel: string;
    readonly lead: string;
    readonly strong: string;
    readonly tail: string;
    readonly cta: string;
  };

  /** Les opérations datées du fournil, quand il y en a. */
  readonly events: {
    readonly title: string;
    readonly lead: string;
    /**
     * L'action de la carte d'opération. Elle vient de la COPIE et non de
     * l'opération : le fournil décide de ce qu'il propose, pas des mots par
     * lesquels on y entre.
     */
    readonly cta: string;
  };

  /** Quand la plateforme ne déclare aucun point : on le dit, on n'invente pas. */
  readonly empty: {
    readonly title: string;
    readonly subtitle: string;
  };
}

export const ACCUEIL_PUBLIC_FR: AccueilPublicCopy = {
  kicker: 'Bienvenue',
  screenTitle: 'Commander.\nRetirer.\nDéguster.',
  hero: {
    tag: 'Retrait en boutique',
    title: 'Je passe la prendre',
    intro:
      'Choisissez votre maison — l’heure se choisit juste après, et la remise du retrait s’applique toute seule.',
  },
  proof: {
    discount: '−{value}',
    discountLabel: 'au retrait',
    opensLabel: 'Première ouverture',
  },
  houses: {
    best: 'Le plus avantageux',
    choose: 'Choisir',
    closed: 'Fermé',
    closedHint: 'Cette maison ne prend pas de commande pour le moment.',
    count: '{count} maisons',
    scroll: 'faites défiler',
  },
  browse: {
    helpLabel: 'Bon à savoir',
    lead: 'Pas encore décidé ?',
    strong: 'Voyez d’abord les fournées',
    tail: '— vous choisirez la maison et l’heure au moment du panier.',
    cta: 'Je visite la boutique',
  },
  events: {
    title: 'En ce moment',
    lead: 'Les opérations datées du fournil — commandables sans compte, avec leur propre délai.',
    cta: 'Voir le rayon',
  },
  empty: {
    title: 'Aucune maison ouverte',
    subtitle: 'Nous ne pouvons pas proposer de retrait pour l’instant. Revenez un peu plus tard.',
  },
};

export const ACCUEIL_PUBLIC_EN: AccueilPublicCopy = {
  kicker: 'Welcome',
  screenTitle: 'Order.\nCollect.\nEnjoy.',
  hero: {
    tag: 'Shop pickup',
    title: 'I’ll come and get it',
    intro:
      'Pick your bakery — the time comes right after, and the pickup discount applies on its own.',
  },
  proof: {
    discount: '−{value}',
    discountLabel: 'on pickup',
    opensLabel: 'Doors open',
  },
  houses: {
    best: 'Best value',
    choose: 'Choose',
    closed: 'Closed',
    closedHint: 'This bakery is not taking orders right now.',
    count: '{count} bakeries',
    scroll: 'scroll to see more',
  },
  browse: {
    helpLabel: 'Good to know',
    lead: 'Not decided yet?',
    strong: 'Look at today’s bakes first',
    tail: '— you’ll pick the bakery and the time at checkout.',
    cta: 'Browse the shop',
  },
  events: {
    title: 'Right now',
    lead: 'Dated bakery offers — orderable without an account, each with its own lead time.',
    cta: 'See the range',
  },
  empty: {
    title: 'No bakery open',
    subtitle: 'We can’t offer pickup at the moment. Please come back a little later.',
  },
};

export const ACCUEIL_PUBLIC_IT: AccueilPublicCopy = {
  kicker: 'Benvenuti',
  screenTitle: 'Ordinare.\nRitirare.\nGustare.',
  hero: {
    tag: 'Ritiro in bottega',
    title: 'Passo a prenderlo',
    intro:
      'Scegliete la vostra bottega — l’orario si sceglie subito dopo, e lo sconto del ritiro si applica da sé.',
  },
  proof: {
    discount: '−{value}',
    discountLabel: 'al ritiro',
    opensLabel: 'Prima apertura',
  },
  houses: {
    best: 'Il più vantaggioso',
    choose: 'Scegli',
    closed: 'Chiuso',
    closedHint: 'Questa bottega al momento non prende ordini.',
    count: '{count} botteghe',
    scroll: 'scorrete',
  },
  browse: {
    helpLabel: 'Buono a sapersi',
    lead: 'Non avete ancora deciso?',
    strong: 'Guardate prima le infornate',
    tail: '— sceglierete bottega e orario al momento del carrello.',
    cta: 'Visito la bottega',
  },
  events: {
    title: 'In questo momento',
    lead: 'Le operazioni datate del forno — ordinabili senza account, ognuna col suo preavviso.',
    cta: 'Vedi il reparto',
  },
  empty: {
    title: 'Nessuna bottega aperta',
    subtitle: 'Al momento non possiamo offrire il ritiro. Tornate un po’ più tardi.',
  },
};

const DICTIONARIES: Readonly<Record<LocaleCode, AccueilPublicCopy>> = {
  fr: ACCUEIL_PUBLIC_FR,
  en: ACCUEIL_PUBLIC_EN,
  it: ACCUEIL_PUBLIC_IT,
};

/** Le dictionnaire de la langue choisie. */
export function accueilPublicCopy(locale: LocaleCode): AccueilPublicCopy {
  return DICTIONARIES[locale];
}
