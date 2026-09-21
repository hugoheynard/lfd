import type { LocaleCode } from '../../client-locale.service';

/**
 * Ce que dit l'ouverture de compte pro, dans les trois langues : la porte
 * `/ouverture-compte-pro`, la carte « Compléter mon dossier » et la promesse
 * « la boutique ouvre bientôt » (plan `plan-inscription-pro-seule.md` §3).
 *
 * ⚠️ (2026-09-14) Ce dictionnaire n'est PAS encore rangé dans `ClientCopy` :
 * `client-copy.model.ts` et ses trois langues étaient en cours de modification
 * par un lot parallèle. Les écrans le lisent par {@link proAccountCopy}. Le
 * ranger ensuite sous une clé `proAccount` de `ClientCopy` ne change que leurs
 * lectures.
 *
 * La copie est celle d'une porte PRO : ni devis traiteur, ni rappel commercial.
 * Le lien vient de la commerciale — la personne n'a plus à être convaincue,
 * elle a à être reçue.
 */
export interface ProAccountCopy {
  readonly door: {
    readonly kicker: string;
    readonly heading: string;
    readonly intro: string;
    /**
     * Le TITRE de la carte — « Ouvrir mon compte pro » (Hugo, 2026-09-21).
     *
     * ⚠️ Le nom de la clé dit encore `eyebrow`, et c'est volontaire : le
     * renommer toucherait les trois dictionnaires et tous ses lecteurs pour un
     * gain nul. Il a été SUR-TITRE jusqu'à ce que la carte prenne la forme de
     * la réf ; son rôle a changé, pas sa place dans le dictionnaire.
     */
    readonly eyebrow: string;
    readonly pitch: string;
    readonly submit: string;
    readonly alreadyLead: string;
    readonly alreadyLink: string;
    readonly fine: string;

    /**
     * Les trois preuves de la colonne d'encre, quand la porte PRO est ouverte.
     *
     * ⚠️ Elles ne se confondent pas avec `ClientCopy.aside.proof`, qui est
     * celle du PARTICULIER : le même bandeau sert les deux portes, et c'est
     * justement ce qu'il dit qui doit changer avec elle (handoff
     * `handoff-inscription`, §1). Trois, parce que la colonne en rend trois —
     * le tuple l'impose plutôt que de l'espérer.
     */
    readonly proof: readonly [string, string, string];

    /**
     * **L'encart de rappel, sous le formulaire pro** (handoff
     * `handoff-inscription`, §4 ; Hugo, 2026-09-21).
     *
     * ⚠️ Il ne réutilise PAS `ClientCopy.pro`, qui vend l'espace pro à un
     * particulier (« Tarifs négociés… On vous explique en deux minutes »). Ici,
     * la personne est déjà devant le formulaire pro : lui vendre ce qu'elle est
     * en train d'ouvrir serait parler à quelqu'un d'autre. Ce qu'elle peut
     * avoir, c'est un doute — et une voix au bout du fil.
     *
     * 🔴 Le rappel ne conditionne rien (§4) : c'est une porte de sortie
     * humaine, pas une étape. Le formulaire s'envoie sans lui.
     */
    readonly callbackTitle: string;
    readonly callbackPitch: string;
  };
  /** Les champs, partagés par la porte et la carte : ils disent la même chose. */
  readonly fields: {
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly emailPlaceholder: string;
    readonly phone: string;
    readonly phonePlaceholder: string;
    readonly phoneHint: string;
    readonly enseigne: string;
    readonly enseignePlaceholder: string;
  };
  readonly dossier: {
    readonly title: string;
    readonly subtitle: string;
    readonly pitch: string;
    readonly submit: string;
  };
  /**
   * La promesse, selon le niveau de la boutique. **Aucune date** : rien dans le
   * système n'en porte une (plan §3.1).
   */
  readonly promise: {
    readonly closed: string;
    /** ⚠️ Copie À VALIDER à l'écran (plan §3.1) — elle invite déjà au rayon. */
    readonly browse: string;
  };
}

export const PRO_ACCOUNT_FR: ProAccountCopy = {
  door: {
    kicker: 'Espace pro',
    heading: 'Ouvrez le compte de votre établissement.',
    intro: 'Cinq informations, un mot de passe, et votre espace est prêt.',
    eyebrow: 'Ouvrir mon compte pro',
    pitch:
      'Qui vous êtes, et le nom de votre établissement. Le reste du dossier se complète ensuite, depuis Mon compte.',
    submit: 'Créer mon compte pro',
    alreadyLead: 'Déjà client ?',
    alreadyLink: 'Se connecter',
    fine: 'Aucun document n’est demandé à l’ouverture : le KBIS se dépose ensuite depuis Mon compte.',
    proof: [
      'Des remises dès la première commande.',
      'Vos paniers récurrents, retrouvés d’une fois sur l’autre.',
      'Facturation mensuelle sur demande.',
    ],
    callbackTitle: 'Une question sur le compte pro ?',
    callbackPitch:
      'On vous rappelle depuis le fournil et on ouvre le dossier avec vous. Ça ne retarde rien : vous pouvez envoyer le formulaire sans attendre.',
  },
  fields: {
    firstName: 'Prénom',
    lastName: 'Nom',
    email: 'E-mail',
    emailPlaceholder: 'vous@exemple.fr',
    phone: 'Téléphone',
    phonePlaceholder: '06 00 00 00 00',
    phoneHint: 'Pour qu’un livreur qui cherche la porte puisse appeler.',
    enseigne: 'Enseigne',
    enseignePlaceholder: 'Le nom de votre établissement',
  },
  dossier: {
    title: 'Compléter mon dossier',
    subtitle: 'Votre établissement',
    pitch:
      'Il nous manque de quoi ouvrir le dossier de votre établissement. Une fois envoyé, nous le vérifions.',
    submit: 'Envoyer mon dossier',
  },
  promise: {
    closed: 'Notre boutique en ligne ouvre bientôt. En attendant, configurez votre espace.',
    browse:
      'Notre boutique en ligne ouvre bientôt. En attendant, configurez votre espace et découvrez déjà la boutique.',
  },
};

export const PRO_ACCOUNT_EN: ProAccountCopy = {
  door: {
    kicker: 'Trade account',
    heading: 'Open your venue’s account.',
    intro: 'Five details, a password, and your space is ready.',
    eyebrow: 'Open my trade account',
    pitch:
      'Who you are, and your venue’s name. The rest of the file can be completed later, from My account.',
    submit: 'Create my trade account',
    alreadyLead: 'Already a customer?',
    alreadyLink: 'Sign in',
    fine: 'No documents are needed to open the account: the company registration can be uploaded later from My account.',
    proof: [
      'Trade rates from your very first order.',
      'Your recurring baskets, found again next time.',
      'Monthly invoicing on request.',
    ],
    callbackTitle: 'A question about the trade account ?',
    callbackPitch:
      'We call you back from the bakery and open the file with you. It delays nothing: you can send the form without waiting.',
  },
  fields: {
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    phone: 'Phone',
    phonePlaceholder: '+33 6 00 00 00 00',
    phoneHint: 'So a driver looking for the door can call.',
    enseigne: 'Venue name',
    enseignePlaceholder: 'The name of your venue',
  },
  dossier: {
    title: 'Complete my file',
    subtitle: 'Your venue',
    pitch: 'We still need a few details to open your venue’s file. Once sent, we review it.',
    submit: 'Send my file',
  },
  promise: {
    closed: 'Our online shop opens soon. In the meantime, set up your space.',
    browse:
      'Our online shop opens soon. In the meantime, set up your space and take a first look at the shop.',
  },
};

export const PRO_ACCOUNT_IT: ProAccountCopy = {
  door: {
    kicker: 'Area professionisti',
    heading: 'Aprite l’account del vostro locale.',
    intro: 'Cinque informazioni, una password, e il vostro spazio è pronto.',
    eyebrow: 'Aprire il mio account pro',
    pitch:
      'Chi siete e il nome del vostro locale. Il resto della pratica si completa dopo, da Il mio account.',
    submit: 'Crea il mio account pro',
    alreadyLead: 'Già cliente?',
    alreadyLink: 'Accedi',
    fine: 'Nessun documento richiesto all’apertura: la visura si carica dopo, da Il mio account.',
    proof: [
      'Sconti fin dal primo ordine.',
      'I vostri carrelli ricorrenti, ritrovati ogni volta.',
      'Fatturazione mensile su richiesta.',
    ],
    callbackTitle: 'Una domanda sull’account pro ?',
    callbackPitch:
      'Vi richiamiamo dal forno e apriamo la pratica con voi. Non ritarda nulla: potete inviare il modulo senza aspettare.',
  },
  fields: {
    firstName: 'Nome',
    lastName: 'Cognome',
    email: 'E-mail',
    emailPlaceholder: 'voi@esempio.it',
    phone: 'Telefono',
    phonePlaceholder: '+39 300 000 0000',
    phoneHint: 'Perché un fattorino che cerca la porta possa chiamare.',
    enseigne: 'Insegna',
    enseignePlaceholder: 'Il nome del vostro locale',
  },
  dossier: {
    title: 'Completa la pratica',
    subtitle: 'Il vostro locale',
    pitch:
      'Ci mancano alcuni dati per aprire la pratica del vostro locale. Una volta inviata, la verifichiamo.',
    submit: 'Invia la pratica',
  },
  promise: {
    closed: 'Il nostro negozio online apre presto. Nel frattempo, configurate il vostro spazio.',
    browse:
      'Il nostro negozio online apre presto. Nel frattempo, configurate il vostro spazio e scoprite già il negozio.',
  },
};

const DICTIONARIES: Readonly<Record<LocaleCode, ProAccountCopy>> = {
  fr: PRO_ACCOUNT_FR,
  en: PRO_ACCOUNT_EN,
  it: PRO_ACCOUNT_IT,
};

/** Le dictionnaire de la langue choisie. */
export function proAccountCopy(locale: LocaleCode): ProAccountCopy {
  return DICTIONARIES[locale];
}
