import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { isKnownFeatureKey, levelLabel } from '../../../admin/feature-access/feature-access-labels';
import { entries, optional, recordOf, strings, type Payload } from '../payload-read';
import {
  byActor,
  citePerson,
  citedName,
  fieldList,
  fromTo,
  inUnit,
  name,
  subject,
  subjectLabelOf,
  text,
  value,
  valueIn,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';
import {
  ACTIVATION_STEP,
  CLIENT_NOTE_ACTION,
  COMPANY_ROLE,
  COMPANY_STATUS_ACTION,
  DEFERRED_TERM,
  FULFILLMENT_METHOD,
  PROCEDURE_ACTION,
  RECURRENCE,
  SUPPORT_CHANNEL,
} from '../values/accounts-values';
import { labelIn } from '../values';

/**
 * **Les comptes et les paniers** — une société, les personnes qui y entrent,
 * leurs paniers récurrents, leurs demandes de contact et les accès aux
 * fonctionnalités (famille `accountsAndCarts` du catalogue des faits, lot D du
 * plan des phrases, 2026-09-19). Guide : en tête de `phrase-registry.ts`.
 *
 * Le sujet d'un fait `company.*` est la société, dite « le client « … » » et
 * liée à sa fiche ; une ligne d'avant le lot B, qui ne porte pas son nom, dit
 * « un client » — le lien et l'identifiant restent sur la ligne.
 *
 * 🔴 Aucune phrase ne dit une coordonnée : une adresse se dit par sa ville et
 * son code postal, un RIB par ses quatre derniers caractères, une personne par
 * son nom. L'adresse e-mail d'une dérogation d'accès reste au détail, telle
 * que la charge la porte (`documentation/journalisation/todo-derogations-d-acces.md`).
 */

/**
 * Les types dont une charge hors schéma ne se rend PAS brute dans le détail :
 * leur schéma garantit qu'aucun contenu n'y entre, et une charge qui n'y
 * répondrait pas ne doit pas le faire entrer par l'écran.
 */
export const NO_RAW_DETAIL: ReadonlySet<string> = new Set<JournalFactType>([
  'company.client_note_edited_by_staff',
]);

/** Comment le client se dit selon sa place dans la phrase. */
type ClientCase = 'the' | 'of' | 'to';

const CLIENT_WITHOUT_NAME: Readonly<Record<ClientCase, string>> = {
  the: 'un client',
  of: 'd’un client',
  to: 'à un client',
};

const CLIENT_NAMED: Readonly<Record<ClientCase, string>> = {
  the: 'le client',
  of: 'du client',
  to: 'au client',
};

/** « le client « Café des Halles » », lié à sa fiche — « un client » sur une ligne sans nom. */
function client(fact: PhraseFact, form: ClientCase): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text(CLIENT_WITHOUT_NAME[form])]
    : [text(`${CLIENT_NAMED[form]} « `), subject(fact, label), text(' »')];
}

/** Une phrase sur le client : « <auteur> <avant> le client « X »<après> ». */
function onClient(
  before: string,
  form: ClientCase,
  after: readonly Segment[] = [],
  consumed: readonly string[] = [],
): Phrase {
  return (fact) =>
    byActor(fact, [text(before), ...client(fact, form), ...after], ['subjectLabel', ...consumed]);
}

/** « Paris (75011) » — la ville et le code postal d'une adresse, ou ce qu'on en a. */
function placeOf(record: Payload | null): string | null {
  const town = optional(record?.['ville']);
  const postcode = optional(record?.['codePostal']);
  if (town !== null && postcode !== null) {
    return `${town} (${postcode})`;
  }
  return town ?? postcode;
}

/**
 * L'adresse de livraison citée : dans `address` (forme courante), à plat
 * (`addressId`, `ville`, `codePostal`, formes d'avant), ou par son seul id.
 * `of` : après « de » — « de l'adresse… », « d'une adresse… ».
 */
function deliveryAddress(p: Payload, of = false): Segment[] {
  const cited = recordOf(p['address']);
  const place = placeOf(cited) ?? placeOf(p);
  if (place !== null) {
    return [text(of ? 'de l’adresse à ' : 'l’adresse de livraison à '), name(place)];
  }
  const id = optional(cited?.['id']) ?? optional(p['addressId']);
  const noun = of ? 'd’une adresse de livraison' : 'une adresse de livraison';
  return [text(id === null ? noun : `${noun} (identifiant ${id})`)];
}

const ADDRESS_KEYS = ['address', 'addressId', 'ville', 'codePostal'];

/** « rôle : administrateur » — le rôle d'un contact ou d'un accès. */
function roleOf(raw: unknown): Segment[] {
  return optional(raw) === null
    ? []
    : [text(', rôle : '), valueIn(COMPANY_ROLE, raw, { inSentence: true })];
}

/** « le contact Jean Dupont », « un contact (identifiant cc_1) ». */
function contactOf(p: Payload): Segment[] {
  const cited = p['contact'] ?? p['contactId'];
  const called = citedName(cited);
  return called === null ? citePerson(cited, 'un contact') : [text('le contact '), name(called)];
}

const CONTACT_KEYS = ['contact', 'contactId', 'role'];

/** « …1234 (Café des Halles SARL) » — un RIB par sa fin et son titulaire, jamais l'IBAN. */
function ribOf(raw: unknown): Segment[] {
  const rib = recordOf(raw);
  const last4 = optional(rib?.['last4']);
  const holder = optional(rib?.['holder']);
  return [
    value(last4 === null ? 'un RIB' : `…${last4}`),
    ...(holder === null ? [] : [text(' ('), name(holder), text(')')]),
  ];
}

/** « mensuel », « mensuel, trimestriel » — des conditions de règlement. */
function termsOf(raw: unknown): Segment[] {
  const terms = Array.isArray(raw) ? raw : [];
  return terms.flatMap((term, index) => [
    ...(index === 0 ? [] : [text(', ')]),
    valueIn(DEFERRED_TERM, term, { inSentence: true }),
  ]);
}

/**
 * Le sujet quand c'est la personne qui agit sur son propre compte : le nom
 * figé est celui de l'auteur, la phrase ne le répète pas. S'il en diffère — ou
 * si l'auteur n'a pas de nom —, le moteur l'ajoute en fin de phrase.
 */
function selfLabel(fact: PhraseFact): string[] {
  return subjectLabelOf(fact) === fact.actor ? ['subjectLabel'] : [];
}

/** « Jean Dupont », sans guillemets : le sujet d'un fait est ici une personne. */
function person(fact: PhraseFact, someone: string): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null ? [text(someone)] : [subject(fact, label)];
}

/** Pour qui : le client (sujet `company`), ou la personne (sujet `user`). */
function forWhom(fact: PhraseFact): Segment[] {
  if (subjectLabelOf(fact) === null) {
    return [];
  }
  return fact.subjectType === 'company'
    ? [text(', pour '), ...client(fact, 'the')]
    : [text(', pour '), ...person(fact, '')];
}

// ─── La société ─────────────────────────────────────────────────────────────

/**
 * « Jean Dupont a déclaré sa société « Café des Halles » » (le client, seul) ou
 * « Colette Martin a ouvert le compte du client « Café des Halles » » (l'équipe),
 * puis le détenteur — « sans détenteur » quand l'équipe ouvre sans lui.
 */
const companyDeclared: Phrase = (fact) => {
  const p = fact.payload;
  const self = p['via'] === 'self';
  const label = subjectLabelOf(fact);
  const own = label === null ? [] : [text(' « '), subject(fact, label), text(' »')];
  const head = self
    ? [text('a déclaré sa société'), ...own]
    : [text('a ouvert le compte '), ...client(fact, 'of')];
  const owner = p['owner'] ?? p['ownerUserId'];
  const holder =
    owner === null || owner === undefined
      ? [text(', sans détenteur')]
      : [text(', détenteur : '), ...citePerson(owner)];
  return byActor(fact, [...head, ...holder], ['subjectLabel', 'via', 'owner', 'ownerUserId']);
};

/** « … a retiré la certification du KBIS du client « X », ce qui a suspendu son compte ». */
const kbisRevoked: Phrase = (fact) => {
  const suspended = fact.payload['suspended'] === true;
  return byActor(
    fact,
    [
      text('a retiré la certification de l’extrait KBIS '),
      ...client(fact, 'of'),
      ...(suspended ? [text(', ce qui a suspendu son compte')] : []),
    ],
    ['subjectLabel', ...(suspended ? ['suspended'] : [])],
  );
};

/** « … a déposé l'extrait KBIS du client « X » (kbis.pdf) » — le dépôt, par le client ou à sa place. */
const kbisUploaded: Phrase = (fact) => {
  const file = optional(fact.payload['fileName']);
  return byActor(
    fact,
    [
      text('a déposé l’extrait KBIS '),
      ...client(fact, 'of'),
      ...(file === null ? [] : [text(' ('), name(file), text(')')]),
    ],
    ['subjectLabel', 'fileName'],
  );
};

/** « … a modifié l'identité du client « X » : enseigne, numéro de TVA ». */
const identityEdited: Phrase = (fact) => {
  const fields = strings(fact.payload['fields']);
  return byActor(
    fact,
    [
      text('a modifié l’identité '),
      ...client(fact, 'of'),
      text(fields.length === 0 ? '' : ` : ${fieldList(fields)}`),
    ],
    ['subjectLabel', 'fields'],
  );
};

/** « … a accordé au client « X » les conditions de règlement : mensuel » ; une liste vide les retire. */
const paymentTermsGranted: Phrase = (fact) => {
  const terms = termsOf(fact.payload['terms']);
  return terms.length === 0
    ? byActor(
        fact,
        [text('a retiré les conditions de règlement '), ...client(fact, 'of')],
        ['subjectLabel', 'terms'],
      )
    : byActor(
        fact,
        [
          text('a accordé '),
          ...client(fact, 'to'),
          text(' les conditions de règlement : '),
          ...terms,
        ],
        ['subjectLabel', 'terms'],
      );
};

/**
 * « … a demandé un règlement mensuel pour le client « X » », « … a retiré la
 * demande de règlement mensuel du client « X » ».
 */
const paymentTermRequested: Phrase = (fact) => {
  const p = fact.payload;
  const term = (raw: unknown) => valueIn(DEFERRED_TERM, raw, { inSentence: true });
  const before = optional(p['before']);
  const after = optional(p['after']);
  const consumed = ['subjectLabel', 'before', 'after'];
  if (after === null) {
    return byActor(
      fact,
      [
        text('a retiré la demande de règlement'),
        ...(before === null ? [] : [text(' '), term(before)]),
        text(' '),
        ...client(fact, 'of'),
      ],
      consumed,
    );
  }
  return byActor(
    fact,
    [
      text('a demandé un règlement '),
      term(after),
      text(' pour '),
      ...client(fact, 'the'),
      ...(before === null || before === after
        ? []
        : [text(' (au lieu de '), term(before), text(')')]),
    ],
    consumed,
  );
};

const STATUS_VERBS: Readonly<Record<string, string>> = {
  suspend: 'a suspendu le compte ',
  reactivate: 'a réactivé le compte ',
  terminate: 'a résilié le compte ',
};

/** « … a suspendu le compte du client « X » ». */
const statusChanged: Phrase = (fact) => {
  const action = fact.payload['action'];
  const verb = typeof action === 'string' ? STATUS_VERBS[action] : undefined;
  return verb === undefined
    ? byActor(
        fact,
        [
          text('a changé le statut du compte '),
          ...client(fact, 'of'),
          text(' : '),
          valueIn(COMPANY_STATUS_ACTION, action, { inSentence: true }),
        ],
        ['subjectLabel', 'action'],
      )
    : byActor(fact, [text(verb), ...client(fact, 'of')], ['subjectLabel', 'action']);
};

/** « … a enregistré l'adresse de facturation du client « X », à Paris (75011) ». */
const billingAddressSaved: Phrase = (fact) => {
  const place = placeOf(fact.payload);
  return byActor(
    fact,
    [
      text('a enregistré l’adresse de facturation '),
      ...client(fact, 'of'),
      ...(place === null ? [] : [text(', à '), name(place)]),
    ],
    ['subjectLabel', 'ville', 'codePostal'],
  );
};

/** « … a <verbe> l'adresse de livraison à Paris (75011) <liaison> le client « X » ». */
function onDeliveryAddress(verb: string, form: ClientCase, after = ''): Phrase {
  return (fact) =>
    byActor(
      fact,
      [
        text(`${verb} `),
        ...deliveryAddress(fact.payload),
        text(' '),
        ...client(fact, form),
        text(after),
      ],
      ['subjectLabel', ...ADDRESS_KEYS],
    );
}

/**
 * « … a modifié la procédure de livraison de l'adresse à Paris (75011) du
 * client « X » : étape ajoutée ». Le geste, jamais ce qui a été écrit.
 */
const deliveryProcedureEdited: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a modifié la procédure de livraison '),
      ...deliveryAddress(fact.payload, true),
      text(' '),
      ...client(fact, 'of'),
      text(' : '),
      valueIn(PROCEDURE_ACTION, fact.payload['action'], { inSentence: true }),
    ],
    // `companyId` (formes d'avant) répète le sujet de la ligne.
    ['subjectLabel', 'companyId', 'action', ...ADDRESS_KEYS],
  );

/**
 * « … a réglé le client « X » en livraison par coursier par défaut, à Paris
 * (75011), signature exigée ». Le point de retrait n'est connu que par son id :
 * il reste au détail.
 */
const fulfillmentPreferenceSet: Phrase = (fact) => {
  const p = fact.payload;
  const method = optional(p['method']);
  if (method === null) {
    return byActor(
      fact,
      [text('a retiré le mode d’acheminement par défaut '), ...client(fact, 'of')],
      ['subjectLabel', 'method'],
    );
  }
  const delivery = method === 'delivery';
  const cited = recordOf(p['deliveryAddress']);
  const place = placeOf(cited);
  const signature = p['signatureRequired'];
  const signs = delivery && typeof signature === 'boolean';
  return byActor(
    fact,
    [
      text('a réglé '),
      ...client(fact, 'the'),
      text(' en '),
      valueIn(FULFILLMENT_METHOD, method, { inSentence: true }),
      text(' par défaut'),
      ...(delivery && place !== null ? [text(', à '), name(place)] : []),
      ...(signs ? [text(signature ? ', signature exigée' : ', sans signature')] : []),
    ],
    [
      'subjectLabel',
      'method',
      ...(delivery && place !== null ? ['deliveryAddress'] : []),
      ...(signs ? ['signatureRequired'] : []),
    ],
  );
};

/** « … a ajouté le contact Jean Dupont au client « X », rôle : administrateur ». */
function onContact(verb: string, form: ClientCase): Phrase {
  return (fact) =>
    byActor(
      fact,
      [
        text(`${verb} `),
        ...contactOf(fact.payload),
        text(' '),
        ...client(fact, form),
        ...roleOf(fact.payload['role']),
      ],
      ['subjectLabel', ...CONTACT_KEYS],
    );
}

/** « … a ouvert à Jean Dupont un accès à l'espace du client « X », rôle : administrateur ». */
const accessOpened: Phrase = (fact) => {
  const p = fact.payload;
  return byActor(
    fact,
    [
      text('a ouvert à '),
      ...citePerson(p['person'] ?? p['userId']),
      text(' un accès à l’espace '),
      ...client(fact, 'of'),
      ...roleOf(p['role']),
    ],
    ['subjectLabel', 'person', 'userId', 'role'],
  );
};

/**
 * « … a déposé le RIB du client « X » : …1234 (Café SARL) », ou « … a changé
 * le RIB du client « X » de …1111 (A) à …2222 (B) ». `via` redit l'auteur.
 */
const bankAccountChanged: Phrase = (fact) => {
  const p = fact.payload;
  const first = recordOf(p['before']) === null;
  return byActor(
    fact,
    first
      ? [text('a déposé le RIB '), ...client(fact, 'of'), text(' : '), ...ribOf(p['after'])]
      : [
          text('a changé le RIB '),
          ...client(fact, 'of'),
          text(' '),
          ...fromTo(ribOf(p['before']), ribOf(p['after'])),
        ],
    ['subjectLabel', 'before', 'after', 'via'],
  );
};

/**
 * « … a modifié les notes du commercial du client « X » : note ajoutée ».
 *
 * Le fait ne porte AUCUN contenu — ni titre, ni description, ni photo — et la
 * phrase n'en invente pas : une note supprimée définitivement ne doit rester
 * lisible nulle part, journal compris (plan « notes photo du commercial », D6).
 * Le geste se dit par le seul dictionnaire des valeurs (`CLIENT_NOTE_ACTION`) ;
 * un geste qu'il ne connaît pas n'est pas un mot : la phrase se tait sur lui,
 * et reste vraie.
 */
const clientNoteEdited: Phrase = (fact) => {
  const known = labelIn(CLIENT_NOTE_ACTION, fact.payload['action']) !== null;
  return byActor(
    fact,
    [
      text('a modifié les notes du commercial '),
      ...client(fact, 'of'),
      ...(known
        ? [text(' : '), valueIn(CLIENT_NOTE_ACTION, fact.payload['action'], { inSentence: true })]
        : []),
    ],
    ['subjectLabel', 'companyId', ...(known ? ['action'] : [])],
  );
};

// ─── La personne ────────────────────────────────────────────────────────────

/** « … a modifié son profil : prénom, téléphone » — la personne elle-même, jamais les valeurs. */
const profileUpdated: Phrase = (fact) => {
  const fields = strings(fact.payload['fields']);
  return byActor(
    fact,
    [text(`a modifié son profil${fields.length === 0 ? '' : ` : ${fieldList(fields)}`}`)],
    ['fields', ...selfLabel(fact)],
  );
};

// ─── Les paniers récurrents ─────────────────────────────────────────────────

/** « … a mis en pause un panier récurrent », « … a réactivé un panier récurrent ». */
const subscriptionStatusChanged: Phrase = (fact) => {
  const after = fact.payload['after'];
  if (after === 'paused' || after === 'active') {
    return byActor(
      fact,
      [
        text(
          after === 'paused'
            ? 'a mis en pause un panier récurrent'
            : 'a réactivé un panier récurrent',
        ),
      ],
      ['before', 'after'],
    );
  }
  return byActor(fact, [text('a changé l’état d’un panier récurrent')], []);
};

/**
 * « … a sauté l'échéance du 19 septembre 2026 d'un panier récurrent », ou
 * « … a modifié l'échéance … » — les lignes restent au détail.
 */
const occurrenceOverridden: Phrase = (fact) => {
  const after = recordOf(fact.payload['after']);
  const skipped = after?.['skipped'] === true;
  const bare = skipped && entries(after?.['lines']).length === 0;
  return byActor(
    fact,
    [
      text(skipped ? 'a sauté l’échéance du ' : 'a modifié l’échéance du '),
      inUnit('day', fact.payload['date']),
      text(' d’un panier récurrent'),
    ],
    ['date', ...(bare ? ['after'] : [])],
  );
};

/** « … a supprimé un panier récurrent (chaque semaine, livraison par coursier) ». */
const subscriptionDeleted: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a supprimé un panier récurrent ('),
      valueIn(RECURRENCE, fact.payload['recurrence'], { inSentence: true }),
      text(', '),
      valueIn(FULFILLMENT_METHOD, fact.payload['fulfillmentMethod'], { inSentence: true }),
      text(')'),
    ],
    ['recurrence', 'fulfillmentMethod'],
  );

// ─── L'accès aux fonctionnalités ────────────────────────────────────────────

/** « « Boutique » », ou « une fonctionnalité (identifiant shop) » sur une ligne sans nom. */
function feature(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text(`une fonctionnalité (identifiant ${fact.subjectId})`)]
    : [text('« '), subject(fact, label), text(' »')];
}

/** Le mot d'un niveau, pour la fonctionnalité de la ligne (« Fermée », « Masqué »). */
function level(fact: PhraseFact, raw: unknown): Segment {
  const said = optional(raw) ?? '—';
  return value(isKnownFeatureKey(fact.subjectId) ? levelLabel(fact.subjectId, said) : said);
}

/** « … a passé « Boutique » de Commander à Fermée ». */
const overrideSet: Phrase = (fact) => {
  const p = fact.payload;
  const previous = optional(p['previousValue']);
  return byActor(
    fact,
    [
      text('a passé '),
      ...feature(fact),
      text(' '),
      ...(previous === null
        ? [text('à '), level(fact, p['value']), text(', à la place du réglage par défaut')]
        : fromTo([level(fact, previous)], [level(fact, p['value'])])),
    ],
    ['subjectLabel', 'value', 'previousValue'],
  );
};

/**
 * « … a ouvert « Boutique » à une adresse exemptée ». L'adresse reste au détail,
 * telle que la charge la porte : c'est la seule mémoire de ce que l'exemption
 * ouvrait (sujet mis de côté, `todo-derogations-d-acces.md`).
 */
function exemption(verb: string, end: string): Phrase {
  return (fact) => byActor(fact, [text(`${verb} `), ...feature(fact), text(end)], ['subjectLabel']);
}

export const ACCOUNTS_PHRASES = {
  'company.declared': companyDeclared,
  'company.step_reached': (fact) =>
    byActor(
      fact,
      [
        text('a franchi l’étape « '),
        valueIn(ACTIVATION_STEP, fact.payload['step']),
        text(' » de l’activation '),
        ...client(fact, 'of'),
      ],
      ['subjectLabel', 'step'],
    ),
  'company.activated': onClient('a activé le compte ', 'of'),
  'company.kbis_certified': onClient('a certifié l’extrait KBIS ', 'of'),
  'company.kbis_revoked': kbisRevoked,
  'company.kbis_uploaded': kbisUploaded,
  'company.kbis_uploaded_by_staff': kbisUploaded,
  'company.identity_corrected': onClient('a corrigé l’identité légale ', 'of'),
  'company.identity_edited': identityEdited,
  'company.payment_terms_granted': paymentTermsGranted,
  'company.payment_term_requested': paymentTermRequested,
  'company.status_changed': statusChanged,
  'company.billing_address_saved': billingAddressSaved,
  'company.delivery_address_added': onDeliveryAddress('a ajouté', 'to'),
  'company.delivery_address_updated': onDeliveryAddress('a modifié', 'of'),
  'company.delivery_address_removed': onDeliveryAddress('a supprimé', 'of'),
  'company.default_delivery_set': onDeliveryAddress('a fait de', 'of', ' l’adresse par défaut'),
  'company.delivery_procedure_edited': deliveryProcedureEdited,
  'company.delivery_procedure_edited_by_staff': deliveryProcedureEdited,
  'company.fulfillment_preference_set': fulfillmentPreferenceSet,
  'company.contact_added': onContact('a ajouté', 'to'),
  'company.contact_updated': onContact('a modifié', 'of'),
  'company.contact_removed': onContact('a retiré', 'of'),
  'company.primary_contact_changed': onClient('a changé l’interlocuteur principal ', 'of'),
  'company.access_opened': accessOpened,
  'company.bank_account_changed': bankAccountChanged,
  'company.client_note_edited_by_staff': clientNoteEdited,

  'user.registered': (fact) => byActor(fact, [text('a créé son compte')], selfLabel(fact)),
  'user.profile_updated': profileUpdated,
  'user.password_link_issued': (fact) =>
    byActor(
      fact,
      [
        text('a fabriqué un lien de mot de passe pour '),
        ...person(fact, 'une personne'),
        text(', à lui remettre en personne'),
      ],
      ['subjectLabel'],
    ),

  'subscription.created': (fact) =>
    byActor(
      fact,
      [
        text('a ouvert un panier récurrent ('),
        valueIn(RECURRENCE, fact.payload['recurrence'], { inSentence: true }),
        text(')'),
      ],
      ['recurrence', ...selfLabel(fact)],
    ),
  'subscription.status_changed': subscriptionStatusChanged,
  'subscription.occurrence_overridden': occurrenceOverridden,
  'subscription.deleted': subscriptionDeleted,

  'support.requested': (fact) =>
    byActor(
      fact,
      [
        text('a déposé une demande de contact par '),
        valueIn(SUPPORT_CHANNEL, fact.payload['channel'], { inSentence: true }),
        ...forWhom(fact),
      ],
      ['subjectLabel', 'channel'],
    ),
  'support.handled': (fact) =>
    byActor(fact, [text('a traité une demande de contact'), ...forWhom(fact)], ['subjectLabel']),

  'feature_access.override_set': overrideSet,
  'feature_access.override_cleared': (fact) =>
    byActor(
      fact,
      [
        text('a rendu '),
        ...feature(fact),
        text(' à son réglage par défaut (c’était '),
        level(fact, fact.payload['previousValue']),
        text(')'),
      ],
      ['subjectLabel', 'previousValue'],
    ),
  'feature_access.exemption_added': exemption('a ouvert', ' à une adresse exemptée'),
  'feature_access.exemption_removed': exemption('a retiré l’exemption d’une adresse sur', ''),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
