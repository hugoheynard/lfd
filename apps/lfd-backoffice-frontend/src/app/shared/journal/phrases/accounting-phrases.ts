import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional } from '../payload-read';
import {
  byActor,
  cite,
  fromTo,
  inUnit,
  name,
  said,
  subject,
  subjectLabelOf,
  text,
  value,
  valueIn,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';
import {
  AUTOPILOT_OUTCOME,
  DRAFT_VOIDING_CAUSE,
  MANDATE_STATUS,
  PROOF_PURGE_CAUSE,
  SEPA_SCHEME,
} from '../values/accounting-values';

/**
 * **La comptabilité** — l'entité émettrice et les mandats SEPA (famille
 * `accounting` du catalogue des faits, lot D du plan des phrases, 2026-09-19).
 * Guide : en tête de `phrase-registry.ts`.
 *
 * Jamais une coordonnée bancaire : un compte se dit par ses quatre derniers
 * caractères, un mandat par sa RUM. `via` (l'équipe ou le client) redit ce que
 * l'auteur de la ligne dit déjà : les phrases le consomment.
 */

// ─── L'entité émettrice ─────────────────────────────────────────────────────

/** L'entité émettrice, après sa préposition : « de l'entité… », « d'une entité… ». */
const ENTITY: Readonly<Record<'' | 'de' | 'à', Noun>> = {
  '': { the: 'l’entité émettrice', a: 'une entité émettrice' },
  de: { the: 'de l’entité émettrice', a: 'd’une entité émettrice' },
  à: { the: 'à l’entité émettrice', a: 'à une entité émettrice' },
};

/**
 * « l'entité émettrice « La Folie Douce SAS » », liée à sa fiche. Une forme
 * d'avant le lot B qui ne porte pas son nom dit « une entité émettrice ».
 */
function entity(fact: PhraseFact, prep: keyof typeof ENTITY): Segment[] {
  const label = subjectLabelOf(fact) ?? optional(fact.payload['name']);
  const noun = ENTITY[prep];
  return label === null
    ? [text(noun.a)]
    : [text(`${noun.the} « `), subject(fact, label), text(' »')];
}

/** « <auteur> <verbe> <préposition> l'entité émettrice « X »<après> ». */
function onEntity(
  verb: string,
  prep: keyof typeof ENTITY,
  after: (fact: PhraseFact) => Segment[],
  keys: readonly string[],
): Phrase {
  return (fact) =>
    byActor(
      fact,
      [text(`${verb} `), ...entity(fact, prep), ...after(fact)],
      ['subjectLabel', ...keys],
    );
}

const nothing = (): Segment[] => [];

/**
 * « : échéance à la clôture + 20 jours, constitution 2 h après la clôture,
 * dépôt au plus tard 2 jours ouvrés avant à 16:00 ». Plan
 * `prelevement-automatique.md`, PA1. Une échéance nulle suit le préavis ;
 * un cut-off nul est « à renseigner » — dit tel quel, jamais inventé.
 */
function collectionSchedule(fact: PhraseFact): Segment[] {
  const days = fact.payload['daysAfterClosure'];
  const hours = fact.payload['delayHours'];
  const cutoffDays = fact.payload['depositCutoffBusinessDays'];
  const cutoffTime = optional(fact.payload['depositCutoffTime']);
  return [
    text(' : échéance '),
    ...(typeof days === 'number'
      ? [text('à la clôture + '), inUnit('days', days)]
      : [text('au terme du préavis')]),
    text(', constitution '),
    value(typeof hours === 'number' ? `${String(hours)} h` : '—'),
    text(' après la clôture, dépôt '),
    ...(typeof cutoffDays === 'number' && cutoffTime !== null
      ? [
          text('au plus tard '),
          value(`${String(cutoffDays)} jours ouvrés`),
          text(' avant, à '),
          value(cutoffTime),
        ]
      : [text('limite à renseigner')]),
  ];
}

/**
 * « : pénalités de retard 14,15 %, indemnité de recouvrement 40,00 €, escompte
 * « néant » ». Une mention nulle est « à renseigner » — dite telle quelle,
 * jamais remplacée par le taux légal (plan `plan-emission-de-la-facture.md`, E0).
 */
function invoicePaymentTerms(fact: PhraseFact): Segment[] {
  const rate = fact.payload['latePenaltyRateBasisPoints'];
  const indemnity = fact.payload['recoveryIndemnityCents'];
  const discount = optional(fact.payload['earlyPaymentDiscount']);
  return [
    text(' : pénalités de retard '),
    typeof rate === 'number' ? inUnit('basisPoints', rate) : text('à renseigner'),
    text(', indemnité de recouvrement '),
    typeof indemnity === 'number' ? inUnit('cents', indemnity) : text('à renseigner'),
    text(', escompte '),
    ...(discount === null ? [text('à renseigner')] : [text('« '), value(discount), text(' »')]),
  ];
}

// ─── Les mandats ────────────────────────────────────────────────────────────

const MANDATE: Noun = { the: 'le mandat', a: 'un mandat' };
const OF_MANDATE: Noun = { the: 'du mandat', a: 'd’un mandat' };
const OF_CLIENT: Noun = { the: 'du client', a: 'd’un client' };

/**
 * « le mandat « LFD-2026-0042 » du client « Café des Halles » ». La RUM est le
 * sujet de la ligne ; la forme d'avant le lot B ne cite la société que par son
 * id (« d'un client (identifiant co_…) »).
 */
function mandate(fact: PhraseFact, noun: Noun = MANDATE): Segment[] {
  const rum = subjectLabelOf(fact) ?? optional(fact.payload['reference']);
  const head =
    rum === null ? [text(noun.a)] : [text(`${noun.the} « `), subject(fact, rum), text(' »')];
  return [
    ...head,
    text(' '),
    ...cite(OF_CLIENT, fact.payload['company'] ?? fact.payload['companyId']),
  ];
}

const MANDATE_KEYS = ['subjectLabel', 'reference', 'company', 'companyId'];

/** « … <avant> le mandat « RUM » du client « X »<après> ». */
function onMandate(
  before: string,
  noun: Noun,
  after: (fact: PhraseFact) => Segment[],
  keys: readonly string[],
): Phrase {
  return (fact) =>
    byActor(
      fact,
      [text(before), ...mandate(fact, noun), ...after(fact)],
      [...MANDATE_KEYS, ...keys],
    );
}

/**
 * « … a enregistré la signature du mandat « RUM » du client « X », signé le
 * 19 septembre 2026, qui remplace le mandat « RUM-1 » ».
 */
const mandateSigned: Phrase = (fact) => {
  const p = fact.payload;
  const replaced = p['replacedMandate'] ?? p['replacedMandateId'];
  return byActor(
    fact,
    [
      text('a enregistré la signature '),
      ...mandate(fact, OF_MANDATE),
      text(', signé le '),
      inUnit('day', p['signedAt']),
      ...(replaced === null || replaced === undefined
        ? []
        : [text(', qui remplace '), ...cite(MANDATE, replaced)]),
    ],
    [...MANDATE_KEYS, 'signedAt', 'replacedMandate', 'replacedMandateId'],
  );
};

/**
 * « … a envoyé le mandat « RUM » du client « X » par e-mail ». En mode à blanc
 * (`providerId: null`), aucun courriel n'est parti : la phrase le dit. Sinon,
 * l'identifiant d'envoi reste au détail — il retrouve le courriel chez Resend.
 */
const mandateSent: Phrase = (fact) => {
  const blank = fact.payload['providerId'] === null;
  return byActor(
    fact,
    [
      text('a envoyé '),
      ...mandate(fact),
      text(blank ? ' par e-mail, à blanc : aucun courriel n’est parti' : ' par e-mail'),
    ],
    [...MANDATE_KEYS, ...(blank ? ['providerId'] : [])],
  );
};

/**
 * « … a modifié les options de mandat du RIB au nom de « Café SARL » (client
 * « Café des Halles ») ». Le sujet est le RIB, nommé par son titulaire ; les
 * deux références restent au détail.
 */
const optionsChanged: Phrase = (fact) => {
  const holder = subjectLabelOf(fact);
  return byActor(
    fact,
    [
      text('a modifié les options de mandat '),
      ...(holder === null
        ? [text('d’un RIB')]
        : [text('du RIB au nom de '), subject(fact, holder)]),
      text(' '),
      ...cite(OF_CLIENT, fact.payload['company'] ?? fact.payload['companyId']),
    ],
    ['subjectLabel', 'company', 'companyId', 'via'],
  );
};

/**
 * « La preuve signée du mandat « RUM » du client « X » a été effacée (preuve
 * remplacée) ». Au passif : l'effacement suit un autre geste, que l'auteur de
 * la ligne n'a pas fait pour effacer.
 */
const proofPurged: Phrase = (fact) =>
  said(
    [
      text('La preuve signée '),
      ...mandate(fact, OF_MANDATE),
      text(' a été effacée ('),
      valueIn(PROOF_PURGE_CAUSE, fact.payload['cause'], { inSentence: true }),
      text(')'),
    ],
    [...MANDATE_KEYS, 'cause'],
  );

// ─── Les liens de paiement libres ───────────────────────────────────────────

const PAYMENT_LINK: Noun = { the: 'le lien de paiement', a: 'un lien de paiement' };

/**
 * « … a créé le lien de paiement « Régularisation août » de 120,00 € pour le
 * client « X » ». Faits nés le 2026-09-25 (plan liens de paiement §2b) ; phrase
 * minimale posée avec le fait pour que le registre reste complet — l'écran du
 * lot 4 peut l'affiner.
 */
function onPaymentLink(verb: string): Phrase {
  return (fact) => {
    const client = subjectLabelOf(fact);
    return byActor(
      fact,
      [
        text(`${verb} `),
        ...cite(PAYMENT_LINK, fact.payload['paymentLink']),
        text(' de '),
        inUnit('cents', fact.payload['amountCents']),
        ...(client === null
          ? [text(' pour un client')]
          : [text(' pour le client « '), subject(fact, client), text(' »')]),
      ],
      ['subjectLabel', 'paymentLink', 'amountCents'],
    );
  };
}

/** Un plafond en centimes, ou « aucun » — `null` veut dire « pas de plafond ». */
function capOf(raw: unknown): Segment {
  return raw === null ? value('aucun') : inUnit('cents', raw);
}

// ─── Le lot de prélèvement figé (2026-10-05) ────────────────────────────────

const BATCH: Noun = { the: 'le lot', a: 'un lot' };

/**
 * « … a constitué le lot « Lot B2B 202609 » de l'entité émettrice « X » —
 * 3 lignes, 1 234,00 € ». Le plan : `plan-lot-de-prelevement-fige.md`.
 */
function onBatch(verb: string, after: (fact: PhraseFact) => Segment[] = nothing): Phrase {
  return (fact) => {
    const label = subjectLabelOf(fact);
    const head =
      label === null
        ? [text(BATCH.a)]
        : [text(`${BATCH.the} « `), subject(fact, label), text(' »')];
    return byActor(
      fact,
      [
        text(`${verb} `),
        ...head,
        text(' de '),
        ...cite(ENTITY[''], fact.payload['legalEntity']),
        text(' — '),
        value(`${String(optional(fact.payload['lineCount']) ?? '?')} ligne(s)`),
        text(', '),
        inUnit('cents', fact.payload['totalCents']),
        ...after(fact),
      ],
      [
        'subjectLabel',
        'legalEntity',
        'scheme',
        'cycleClosesAt',
        'lineCount',
        'totalCents',
        'depositable',
        'unmandatedCompanies',
        'excludedCount',
      ],
    );
  };
}

/** Q2 : un lot qui nomme une société sans mandat ne se dépose pas — la phrase le dit. */
function notDepositable(fact: PhraseFact): Segment[] {
  const raw = fact.payload['unmandatedCompanies'];
  const names = Array.isArray(raw)
    ? raw.filter((name): name is string => typeof name === 'string')
    : [];
  return names.length === 0
    ? []
    : [text(', non déposable — sans mandat : '), value(names.join(', '))];
}

// ─── L'arrêté de facturation (2026-10-08) ───────────────────────────────────

const STATEMENT: Noun = { the: 'l’arrêté de facturation', a: 'un arrêté de facturation' };
const FOR_CLIENT: Noun = { the: 'du client', a: 'd’un client' };

/**
 * « … a émis l'arrêté de facturation « Arrêté Lot B2B 202609 · ligne 1 » du
 * client « X » — 12,34 € ». Le plan : `plan-le-prelevement-suit-la-facture.md`, F3.
 */
function onStatement(verb: string): Phrase {
  return (fact) => {
    const label = subjectLabelOf(fact);
    const head =
      label === null
        ? [text(STATEMENT.a)]
        : [text(`${STATEMENT.the} « `), subject(fact, label), text(' »')];
    return byActor(
      fact,
      [
        text(`${verb} `),
        ...head,
        text(' '),
        ...cite(FOR_CLIENT, fact.payload['payer']),
        text(' chez '),
        ...cite(ENTITY[''], fact.payload['legalEntity']),
        text(' — '),
        inUnit('cents', fact.payload['totalCents']),
      ],
      ['subjectLabel', 'payer', 'legalEntity', 'totalCents'],
    );
  };
}

const NOTICE: Noun = { the: 'l’avis de prélèvement', a: 'un avis de prélèvement' };

/** Ce que l'avis annonce, dit dans la phrase : « (rectificatif) » ; rien pour un premier avis. */
const NOTICE_KIND: Readonly<Record<string, string>> = {
  correction: ' (rectificatif)',
  cancellation: ' (annulation)',
  unchanged: ' (avis précédent maintenu)',
};

const NOTICE_KEYS = [
  'subjectLabel',
  'legalEntity',
  'payer',
  'kind',
  'amountCents',
  'collectionDay',
  'previousAmountCents',
  'previousCollectionDay',
  'recipientSource',
  'failure',
];

/**
 * « … a mis en file l'avis de prélèvement « Avis X » (rectificatif) du
 * client « X » chez l'entité « Y » — 105,50 €, le 16 oct. 2026 ». Le plan :
 * `prelevement-automatique.md`, PA2. Jamais l'adresse du destinataire.
 */
function onNotice(verb: string, after: (fact: PhraseFact) => Segment[] = nothing): Phrase {
  return (fact) => {
    const label = subjectLabelOf(fact);
    const head =
      label === null
        ? [text(NOTICE.a)]
        : [text(`${NOTICE.the} « `), subject(fact, label), text(' »')];
    const kind = NOTICE_KIND[String(optional(fact.payload['kind']) ?? 'notice')] ?? '';
    return byActor(
      fact,
      [
        text(`${verb} `),
        ...head,
        text(`${kind} `),
        ...cite(FOR_CLIENT, fact.payload['payer']),
        text(' chez '),
        ...cite(ENTITY[''], fact.payload['legalEntity']),
        text(' — '),
        inUnit('cents', fact.payload['amountCents']),
        text(', le '),
        inUnit('day', fact.payload['collectionDay']),
        ...after(fact),
      ],
      NOTICE_KEYS,
    );
  };
}

const noticeFailure = (fact: PhraseFact): Segment[] => [
  text(' : « '),
  name(optional(fact.payload['failure']) ?? '—'),
  text(' »'),
];

/**
 * « … a tenté la préparation automatique du lot de l'entité émettrice « X »
 * (clôture du 1 oct. 2026, 00:00) : échec — « message » ». Plan
 * `prelevement-automatique.md`, PA3. Une tentative par mois.
 */
function autopilotIssue(fact: PhraseFact): Segment[] {
  const message = optional(fact.payload['message']);
  return [
    text(' (clôture du '),
    inUnit('instant', fact.payload['cycleClosesAt']),
    text(') : '),
    valueIn(AUTOPILOT_OUTCOME, fact.payload['outcome'], { inSentence: true }),
    ...(message === null ? [] : [text(' — « '), name(message), text(' »')]),
  ];
}

export const ACCOUNTING_PHRASES = {
  'legal_entity.declared': onEntity(
    'a déclaré',
    '',
    (fact) => {
      const siren = optional(fact.payload['siren']);
      return siren === null ? [] : [text(' (SIREN '), value(siren), text(')')];
    },
    ['name', 'siren'],
  ),
  // `name` est le nom APRÈS correction : c'est celui que la phrase cite.
  'legal_entity.corrected': onEntity('a corrigé l’identité', 'de', nothing, ['name']),
  'legal_entity.creditor_identifier_assigned': onEntity(
    'a attribué',
    'à',
    (fact) => [text(' l’identifiant créancier SEPA '), value(optional(fact.payload['ics']) ?? '—')],
    ['ics'],
  ),
  'legal_entity.creditor_account_changed': onEntity(
    'a changé le compte où arrivent les prélèvements',
    'de',
    (fact) => {
      const last4 = optional(fact.payload['last4']);
      return last4 === null ? [] : [text(' : '), value(`…${last4}`)];
    },
    ['last4'],
  ),
  'legal_entity.pre_notification_changed': onEntity(
    'a fixé le préavis de prélèvement',
    'de',
    (fact) => [text(' à '), inUnit('days', fact.payload['days'])],
    ['days'],
  ),
  'legal_entity.collection_schedule_changed': onEntity(
    'a réglé le calendrier de prélèvement',
    'de',
    collectionSchedule,
    ['delayHours', 'daysAfterClosure', 'depositCutoffBusinessDays', 'depositCutoffTime'],
  ),
  'legal_entity.auto_collection_enabled': onEntity(
    'a activé le prélèvement automatique',
    'de',
    nothing,
    [],
  ),
  'legal_entity.auto_collection_disabled': onEntity(
    'a désactivé le prélèvement automatique',
    'de',
    nothing,
    [],
  ),
  'legal_entity.invoice_payment_terms_changed': onEntity(
    'a réglé les mentions de paiement de la facture',
    'de',
    invoicePaymentTerms,
    ['latePenaltyRateBasisPoints', 'recoveryIndemnityCents', 'earlyPaymentDiscount'],
  ),
  'legal_entity.mandate_scheme_changed': onEntity(
    'a passé les mandats à venir',
    'de',
    (fact) => [
      text(' '),
      ...fromTo(
        [valueIn(SEPA_SCHEME, fact.payload['from'])],
        [valueIn(SEPA_SCHEME, fact.payload['to'])],
      ),
    ],
    ['from', 'to'],
  ),
  'legal_entity.archived': onEntity('a archivé', '', nothing, ['name']),
  'legal_entity.restored': onEntity('a restauré', '', nothing, ['name']),

  'payment_mandate.minted': onMandate('a généré ', MANDATE, () => [text(', à signer')], ['via']),
  'payment_mandate.proof_attached': onMandate(
    'a déposé la preuve signée ',
    OF_MANDATE,
    (fact) => {
      const file = optional(fact.payload['fileName']);
      return file === null ? [] : [text(', fichier « '), name(file), text(' »')];
    },
    ['fileName', 'via'],
  ),
  'payment_mandate.signed': mandateSigned,
  'payment_mandate.sent': mandateSent,
  'payment_mandate.revoked': onMandate(
    'a révoqué ',
    MANDATE,
    (fact) => [
      text(', qui était '),
      valueIn(MANDATE_STATUS, fact.payload['previousStatus'], { inSentence: true }),
    ],
    ['previousStatus', 'via'],
  ),
  'payment_mandate.draft_voided': onMandate(
    'a annulé le brouillon ',
    OF_MANDATE,
    (fact) => [
      text(' : '),
      valueIn(DRAFT_VOIDING_CAUSE, fact.payload['cause'], { inSentence: true }),
    ],
    ['cause', 'via'],
  ),
  'payment_mandate.options_changed': optionsChanged,
  'payment_mandate.proof_purged': proofPurged,
  'payment_link.created': onPaymentLink('a créé'),
  'payment_link.cancelled': onPaymentLink('a annulé'),
  'accounting_settings.payment_link_cap_set': (fact) =>
    byActor(
      fact,
      [
        text('a changé le plafond des liens de paiement '),
        ...fromTo([capOf(fact.payload['from'])], [capOf(fact.payload['to'])]),
      ],
      ['subjectLabel', 'from', 'to'],
    ),
  'collection.batch_constituted': onBatch('a constitué', notDepositable),
  'collection.batch_cancelled': onBatch('a annulé'),
  'collection.batch_deposited': onBatch('a marqué déposé'),
  'billing_statement.issued': onStatement('a émis'),
  'billing_statement.cancelled': onStatement('a annulé'),
  'collection.notice_queued': onNotice('a mis en file'),
  'collection.notice_unsendable': onNotice('n’a pas pu adresser', () => [
    text(' : ni contact de facturation, ni détenteur avec une adresse'),
  ]),
  'collection.notice_sent': onNotice('a envoyé'),
  'collection.notice_failed': onNotice('n’a pas pu envoyer', noticeFailure),
  'collection.autopilot_ran': onEntity(
    'a tenté la préparation automatique du lot',
    'de',
    autopilotIssue,
    ['cycleClosesAt', 'outcome', 'batchCount', 'message'],
  ),
  'collection.order_settled_otherwise': (fact) => {
    const number = subjectLabelOf(fact);
    return byActor(
      fact,
      [
        text('a noté '),
        ...(number === null
          ? [text('une commande')]
          : [text('la commande « '), subject(fact, number), text(' »')]),
        text(' réglée autrement ('),
        inUnit('cents', fact.payload['amountCents']),
        text(') : « '),
        name(optional(fact.payload['note']) ?? '—'),
        text(' »'),
      ],
      ['subjectLabel', 'amountCents', 'previousState', 'note'],
    );
  },
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
