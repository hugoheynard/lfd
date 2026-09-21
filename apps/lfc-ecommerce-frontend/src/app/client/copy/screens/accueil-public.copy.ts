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
/** Une porte de service, telle que sa carte la dit. */
export interface DoorCopy {
  readonly tag: string;
  /** Le titre en capitales — la coupe vient du dictionnaire. */
  readonly title: string;
  readonly intro: string;
  readonly cta: string;
  /** La mention à côté du bouton : une remise, une heure limite. */
  readonly note: string;
  /**
   * CE QUE DIT LA PORTE QUAND ELLE N'EST PAS ENCORE OUVERTE.
   *
   * Absent sur une porte qui l'est toujours — le retrait. Une porte en attente
   * ne se cache pas et ne se grise pas en silence : elle dit ce qu'on attend
   * et QUI l'ouvre, comme les créneaux hors contrat de la SPEC (§5). Un refus
   * muet renvoie chercher la raison ailleurs.
   */
  readonly pending?: { readonly tag: string; readonly hint: string };
}

/**
 * CE QUI CHANGE DANS LA BANDE DE CONTACT D'UN ÉTAT À L'AUTRE, et rien d'autre.
 *
 * Le sur-titre, les deux boutons et la mention de l'heure creuse ne bougent
 * pas : ce sont des faits sur la MAISON, et ils ne dépendent pas de qui les
 * lit. Ce qui dépend du lecteur, c'est la question qu'on lui suppose — un
 * visiteur se demande si c'est faisable, un client se demande s'il peut encore
 * changer quelque chose, un pro s'il peut encore ajouter.
 */
export interface ContactVariant {
  /** Le titre en capitales — la coupe vient du dictionnaire, pas d'un `<br>`. */
  readonly title: string;
  /** Qui répond, quand, et ce qu'on peut demander. */
  readonly who: string;
}

/** La bande de contact telle que son composant la reçoit : le commun, plus la variante. */
export interface ContactBandCopy extends ContactVariant {
  readonly kicker: string;
  readonly call: string;
  readonly write: string;
  readonly note: string;
}

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

  /**
   * Le CHAPÔ, sous le titre et au-dessus du rail.
   *
   * Il dit en une phrase ce que le titre promet en trois verbes, et lève les
   * deux objections du visiteur avant qu'il les formule : il n'a pas de compte
   * à créer, et il ne fera pas la queue. C'est la seule prose de cet étage —
   * le reste de l'écran est fait de libellés.
   *
   * ⚠️ À ne pas confondre avec `hero.intro`, qui est la ligne du BANDEAU de
   * retrait, plus bas et sur un autre sujet.
   */
  readonly lede: string;

  /**
   * L'ACCROCHE D'UN CLIENT RECONNU — elle remplace les trois verbes.
   *
   * Un visiteur doit apprendre ce que fait cette maison ; quelqu'un qui revient
   * le sait déjà, et la seule chose qu'on ait à lui demander est ce qu'il veut
   * aujourd'hui. D'où un sur-titre qui NOMME le geste (« Nouvelle commande »)
   * là où le visiteur lisait « Bienvenue ».
   */
  readonly hello: {
    readonly kicker: string;
    /** `{name}` — le prénom. La coupe de ligne vient d'ici, pas du HTML. */
    readonly title: string;
    /** Le même, quand la fiche ne porte pas encore de prénom. */
    readonly titleAnonymous: string;
    readonly lede: string;
    /** Les trois pastilles d'un espace PRO, et d'aucun autre. */
    readonly proPills: readonly string[];
  };

  /**
   * LES DEUX PORTES D'UN PRO. Un pro a deux façons d'être servi ; un compte
   * perso n'en a qu'une, et c'est pourquoi il garde le parcours du visiteur.
   */
  readonly doors: {
    readonly pickup: DoorCopy;
    readonly courier: DoorCopy;
    /**
     * `{value}` — la MEILLEURE remise de retrait réellement déclarée, calculée
     * par la même fonction que le rail des maisons et le panier.
     *
     * 🔴 « Jusqu'à », parce que c'est un MAXIMUM : les maisons n'ont pas toutes
     * la même remise, et la porte les annonce toutes d'un mot. Promettre le
     * meilleur sans le dire ferait découvrir l'écart au moment de payer.
     *
     * ⚠️ Sans remise, la mention DISPARAÎT — elle n'annonce pas « jusqu'à
     * −0 % ». C'est la règle des preuves de cet écran, et elle vaut ici.
     */
    readonly pickupUpTo: string;
  };

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

  /**
   * LES DEUX RACCOURCIS, sous les portes — « Ou reprenez » et « Je visite la
   * boutique » (maquette du 2026-09-20).
   *
   * 🔴 « REPRENEZ » NE PARAÎT QUE S'IL Y A UNE COMMANDE À REPRENDRE, et son
   * contenu est celui de la VRAIE dernière commande : ses lignes, son mode, son
   * point de retrait. La même carte existe sur `/nouvelle-commande` avec « 2
   * traditions, 4 croissants, 1 ski praliné · retrait au Labo » écrit en dur, et
   * un bouton qui ne fait rien — elle montre la commande de personne. C'est ce
   * qu'on ne refait pas ici.
   */
  readonly shortcuts: {
    readonly browseTitle: string;
    readonly browseSub: string;
    readonly againLead: string;
    /** `{day}` — le jour de la semaine, quand la commande a moins d'une semaine. */
    readonly againRecent: string;
    /** Le même, plus ancienne : aucun jour n'est nommé plutôt qu'un jour faux. */
    readonly againOlder: string;
    readonly againAction: string;
    /**
     * `{place}` — le point de retrait tel que la COMMANDE l'a gardé, jamais le
     * carnet d'aujourd'hui : c'est là qu'elle a été retirée, même si la maison
     * a fermé depuis.
     *
     * ⚠️ Deux points et non « au » : le nom d'une maison peut être féminin, et
     * la même dette d'article est déjà portée ailleurs (`chooseHouse`). Une de
     * plus serait une de trop.
     */
    readonly againPickup: string;
    readonly againDelivery: string;
    /** `{count}` — les lignes que la liste ne nomme pas, faute de place. */
    readonly againMore: string;
    /**
     * `{count}` — ce que le rayon ne vend plus.
     *
     * 🔴 Une référence retirée ne se laisse PAS tomber en silence : un panier
     * refait plus court qu'annoncé se découvre à la caisse. La carte le dit
     * avant qu'on clique.
     */
    readonly againGone: string;
  };

  /**
   * LA BANDE DE CONTACT — « On répond » (maquette du 2026-09-20, §8).
   *
   * 🔴 ELLE PARAÎT DANS LES TROIS ÉTATS (Hugo, 2026-09-20 : « on répond
   * toujours »), là où la maquette la réservait au pro. Un visiteur est
   * précisément celui qui a le plus de raisons d'appeler : il ne sait pas
   * encore si ce qu'il veut est faisable. Seul le TEXTE change.
   *
   * ⚠️ Les prénoms, les heures et le numéro viennent de la maquette et de la
   * carte de l'espace, où ils sont déjà écrits ; rien dans le système ne les
   * porte. Ils se corrigent ici et dans `client/copy/*.ts`, pas ailleurs.
   */
  readonly contact: {
    readonly kicker: string;
    readonly call: string;
    readonly write: string;
    /**
     * L'HEURE CREUSE, commune aux trois : elle évite un appel qui sonnerait
     * dans le vide. Dire qu'on ne décroche pas coûte moins cher que de ne pas
     * décrocher.
     */
    readonly note: string;
    readonly visitor: ContactVariant;
    readonly personal: ContactVariant;
    readonly pro: ContactVariant;
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
  lede: 'Vous choisissez la maison et l’heure, on sort la fournée pour vous. Pas de compte à créer, pas de file le matin.',
  hello: {
    kicker: 'Nouvelle commande',
    title: 'Bonjour {name}.\nOn vous sert comment ?',
    titleAnonymous: 'Bonjour.\nOn vous sert comment ?',
    lede: 'Vous choisissez, nous préparons. Une seule question pour démarrer : vous venez, ou on vient ?',
    proPills: ['Tarifs pro appliqués', 'Livraison en station', 'Facturation mensuelle'],
  },
  doors: {
    pickup: {
      tag: 'Retrait',
      title: 'Je passe\nla prendre',
      intro: 'Au Labo ou au village, demain à l’heure de mon choix.',
      cta: 'Choisir un point de retrait',
      note: '',
    },
    courier: {
      tag: 'Coursier',
      title: 'On vous\nl’apporte',
      intro: 'Demain, au créneau que vous choisissez.',
      cta: 'Choisir une adresse',
      note: 'Avant 18 h',
      pending: {
        tag: 'Bientôt',
        hint: 'Votre dossier est en cours de validation — votre commercial ouvre la livraison dès qu’il est complet.',
      },
    },
    pickupUpTo: 'Jusqu’à {value}',
  },
  hero: {
    tag: 'Nouvelle commande',
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
  shortcuts: {
    browseTitle: 'Je visite la boutique',
    browseSub: 'Pour voir les produits et décider ensuite',
    againLead: 'Ou reprenez',
    againRecent: 'Comme {day} dernier ?',
    againOlder: 'Comme votre dernière commande ?',
    againAction: 'Refaire',
    againPickup: 'retrait : {place}',
    againDelivery: 'en livraison',
    againMore: '+{count}',
    againGone:
      '{count} article(s) de cette commande ne sont plus au rayon. Le reste est dans votre panier.',
  },
  contact: {
    kicker: 'On répond',
    call: 'Appeler',
    write: 'Écrire',
    note: 'Entre 12 h et 14 h on est au four : on ne prend pas d’appel, et on préfère le dire.',
    visitor: {
      title: 'Une commande\nparticulière ?',
      who: 'Camille et Malik, au Labo, de 7 h à 19 h. Un buffet, un gros volume, une date à part : demandez avant de commander, on vous dira ce qui est faisable.',
    },
    personal: {
      title: 'Une question,\nun imprévu ?',
      who: 'Camille et Malik, au Labo, de 7 h à 19 h. Changer l’heure, ajouter une pièce, annuler : un appel suffit.',
    },
    pro: {
      title: 'Une question,\nun imprévu ?',
      who: 'Camille et Malik, au Labo, de 7 h à 19 h. Un ajout passe encore par téléphone jusqu’à 18 h.',
    },
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
  lede: 'You pick the shop and the time, we pull the batch for you. No account to create, no queue in the morning.',
  hello: {
    kicker: 'New order',
    title: 'Hello {name}.\nHow can we serve you?',
    titleAnonymous: 'Hello.\nHow can we serve you?',
    lede: 'You choose, we bake. One question to start: are you coming, or are we?',
    proPills: ['Trade prices applied', 'Delivery in resort', 'Monthly invoicing'],
  },
  doors: {
    pickup: {
      tag: 'Pickup',
      title: 'I’ll come\nand get it',
      intro: 'At Le Labo or Le Village, tomorrow at the time I choose.',
      cta: 'Choose a pickup point',
      note: '',
    },
    courier: {
      tag: 'Courier',
      title: 'We bring it\nto you',
      intro: 'Tomorrow, in the slot you choose.',
      cta: 'Choose an address',
      note: 'Before 6 pm',
      pending: {
        tag: 'Soon',
        hint: 'Your file is being reviewed — your account manager opens delivery as soon as it is complete.',
      },
    },
    pickupUpTo: 'Up to {value}',
  },
  hero: {
    tag: 'New order',
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
  shortcuts: {
    browseTitle: 'Browse the shop',
    browseSub: 'To see the products and decide afterwards',
    againLead: 'Or start again from',
    againRecent: 'Same as last {day}?',
    againOlder: 'Same as your last order?',
    againAction: 'Reorder',
    againPickup: 'pickup: {place}',
    againDelivery: 'delivered',
    againMore: '+{count}',
    againGone:
      '{count} item(s) from that order are no longer on the shelf. The rest is in your basket.',
  },
  contact: {
    kicker: 'We answer',
    call: 'Call',
    write: 'Write',
    note: 'Between noon and 2 pm we are at the oven: we don’t take calls, and we’d rather say so.',
    visitor: {
      title: 'Something\nout of the ordinary?',
      who: 'Camille and Malik, at Le Labo, 7 am to 7 pm. A buffet, a large order, an unusual date: ask before you order and we’ll tell you what’s possible.',
    },
    personal: {
      title: 'A question,\nsomething unexpected?',
      who: 'Camille and Malik, at Le Labo, 7 am to 7 pm. Changing the time, adding an item, cancelling: one call is enough.',
    },
    pro: {
      title: 'A question,\nsomething unexpected?',
      who: 'Camille and Malik, at Le Labo, 7 am to 7 pm. An extra item still goes through by phone until 6 pm.',
    },
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
  lede: 'Scegliete la bottega e l’ora, noi sforniamo per voi. Nessun account da creare, nessuna fila al mattino.',
  hello: {
    kicker: 'Nuovo ordine',
    title: 'Buongiorno {name}.\nCome possiamo servirla ?',
    titleAnonymous: 'Buongiorno.\nCome possiamo servirla ?',
    lede: 'Lei sceglie, noi prepariamo. Una sola domanda per iniziare : viene lei, o veniamo noi ?',
    proPills: ['Prezzi pro applicati', 'Consegna in stazione', 'Fatturazione mensile'],
  },
  doors: {
    pickup: {
      tag: 'Ritiro',
      title: 'Passo\na prenderlo',
      intro: 'Al Labo o al village, domani all’ora che scelgo.',
      cta: 'Scegliere un punto di ritiro',
      note: '',
    },
    courier: {
      tag: 'Corriere',
      title: 'Glielo\nportiamo',
      intro: 'Domani, nella fascia che sceglie.',
      cta: 'Scegliere un indirizzo',
      note: 'Entro le 18',
      pending: {
        tag: 'Presto',
        hint: 'Il suo fascicolo è in corso di validazione — il suo commerciale apre la consegna appena è completo.',
      },
    },
    pickupUpTo: 'Fino a {value}',
  },
  hero: {
    tag: 'Nuovo ordine',
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
  shortcuts: {
    browseTitle: 'Visito la bottega',
    browseSub: 'Per vedere i prodotti e decidere dopo',
    againLead: 'Oppure riprenda',
    againRecent: 'Come {day} scorso ?',
    againOlder: 'Come il suo ultimo ordine ?',
    againAction: 'Rifare',
    againPickup: 'ritiro : {place}',
    againDelivery: 'in consegna',
    againMore: '+{count}',
    againGone:
      '{count} articolo/i di quest’ordine non sono più in vendita. Il resto è nel suo carrello.',
  },
  contact: {
    kicker: 'Rispondiamo',
    call: 'Chiamare',
    write: 'Scrivere',
    note: 'Tra le 12 e le 14 siamo al forno : non rispondiamo al telefono, e preferiamo dirlo.',
    visitor: {
      title: 'Un ordine\nparticolare ?',
      who: 'Camille e Malik, al Labo, dalle 7 alle 19. Un buffet, un grande volume, una data particolare : chieda prima di ordinare, le diremo cosa è fattibile.',
    },
    personal: {
      title: 'Una domanda,\nun imprevisto ?',
      who: 'Camille e Malik, al Labo, dalle 7 alle 19. Cambiare l’ora, aggiungere un pezzo, annullare : basta una telefonata.',
    },
    pro: {
      title: 'Una domanda,\nun imprevisto ?',
      who: 'Camille e Malik, al Labo, dalle 7 alle 19. Un’aggiunta passa ancora per telefono fino alle 18.',
    },
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
