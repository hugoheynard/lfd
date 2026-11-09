import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { strings } from '../payload-read';
import { ALLERGEN_DISPLAY } from '../values/commerce-values';
import { byActor, countOf, text, value, type Phrase, type Segment } from '../phrase';

/**
 * **La vitrine** — un enregistrement de la composition des pages de la
 * boutique (`storefront.saved`, famille `commerce`,
 * `documentation/commandes/boutique/boutique-rayon-layout.md`, D6).
 *
 * Enregistrer publie, et ce fait est la SEULE trace de qui a vidé un rayon :
 * la phrase dit donc ce qui a bougé, en comptes. Les objets n'ont pas de nom
 * (une forme et une place), et les rayons ne sont portés que par leur
 * identifiant de famille : on les COMPTE, on ne les nomme pas — un identifiant
 * présenté comme un nom est ce que le guide du registre interdit.
 */

const KEYS = ['subjectLabel', 'revision', 'added', 'moved', 'archived', 'shelves'];

/** Ce qui a bougé, dans l'ordre où la phrase le dit. */
const MOVES = [
  ['added', 'objet ajouté', 'objets ajoutés'],
  ['moved', 'objet déplacé', 'objets déplacés'],
  ['archived', 'objet retiré', 'objets retirés'],
] as const;

/** « 1 objet ajouté, 2 objets déplacés » — seulement ce qui n'est pas nul. */
function movements(payload: Readonly<Record<string, unknown>>): Segment[] {
  const parts = MOVES.flatMap(([key, one, many]) => {
    const size = strings(payload[key]).length;
    const segment = size === 0 ? null : countOf(size, one, many);
    return segment === null ? [] : [segment];
  });
  return parts.flatMap((part, index) => (index === 0 ? [part] : [text(', '), part]));
}

/**
 * « Colette Martin a enregistré la vitrine (version 4) : 1 objet ajouté,
 * 1 objet retiré, sur 2 rayons » ; rien de changé : « … sans rien y changer ».
 */
const saved: Phrase = (fact) => {
  const revision = typeof fact.payload['revision'] === 'number' ? fact.payload['revision'] : null;
  const moves = movements(fact.payload);
  const shelves = countOf(strings(fact.payload['shelves']).length, 'rayon', 'rayons');
  return byActor(
    fact,
    [
      text('a enregistré la vitrine'),
      ...(revision === null ? [] : [text(' (version '), value(String(revision)), text(')')]),
      ...(moves.length === 0
        ? [text(', sans rien y changer')]
        : [text(' : '), ...moves, ...(shelves === null ? [] : [text(', sur '), shelves])]),
    ],
    KEYS,
  );
};

const ALLERGEN_DISPLAY_KEYS = ['subjectLabel', 'from', 'to'];

/** Les places des allergènes, dans les mots du dictionnaire des valeurs. */
const ALLERGEN_PLACES: Readonly<Record<string, string>> = ALLERGEN_DISPLAY.labels;

/**
 * **La place des allergènes en boutique** (`storefront.allergen_display_changed`,
 * Hugo, 2026-10-27, `documentation/pim/plan-allergenes-en-boutique.md`).
 *
 * « Colette Martin a réglé les allergènes de la boutique : Aussi dans la
 * galerie (avant : Sur la fiche ouverte seulement) ».
 */
const allergenDisplayChanged: Phrase = (fact) => {
  const to = ALLERGEN_PLACES[String(fact.payload['to'])];
  const from = ALLERGEN_PLACES[String(fact.payload['from'])];
  return byActor(
    fact,
    [
      text('a réglé les allergènes de la boutique'),
      ...(to === undefined ? [] : [text(' : '), value(to)]),
      ...(from === undefined ? [] : [text(' (avant : '), value(from), text(')')]),
    ],
    ALLERGEN_DISPLAY_KEYS,
  );
};

const PUBLISHED_KEYS = ['subjectLabel', 'version', 'changes'];

/** Les textes publiés, triés : remplacés par un nouveau texte, ou rendus au code. */
function publishedChanges(raw: unknown): { readonly rewritten: number; readonly restored: number } {
  const changes = Array.isArray(raw) ? raw : [];
  const restored = changes.filter(
    (change: unknown) =>
      typeof change === 'object' && change !== null && 'after' in change && change.after === null,
  ).length;
  return { rewritten: changes.length - restored, restored };
}

/**
 * **Les textes de la boutique publiés** (`shop_copy.published`,
 * `documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`, §10).
 *
 * « Colette Martin a publié les textes de la boutique (version 3) : 2 textes
 * modifiés, 1 texte rendu à l'original ». La charge porte chaque texte avant
 * et après ; la phrase les COMPTE — une clé de manifeste n'est pas un nom.
 */
const shopCopyPublished: Phrase = (fact) => {
  const version = typeof fact.payload['version'] === 'number' ? fact.payload['version'] : null;
  const { rewritten, restored } = publishedChanges(fact.payload['changes']);
  const parts = [
    rewritten === 0 ? null : countOf(rewritten, 'texte modifié', 'textes modifiés'),
    restored === 0
      ? null
      : countOf(restored, 'texte rendu à l’original', 'textes rendus à l’original'),
  ].flatMap((part) => (part === null ? [] : [part]));
  const listed = parts.flatMap((part, index) => (index === 0 ? [part] : [text(', '), part]));
  return byActor(
    fact,
    [
      text('a publié les textes de la boutique'),
      ...(version === null ? [] : [text(' (version '), value(String(version)), text(')')]),
      ...(listed.length === 0 ? [text(', sans rien changer à l’écran')] : [text(' : '), ...listed]),
    ],
    PUBLISHED_KEYS,
  );
};

/**
 * **Les textes des e-mails publiés** (`mail_copy.published`,
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, C3).
 *
 * « Colette Martin a publié les textes des e-mails (version 3) : 2 textes
 * modifiés, 1 texte rendu à l'original ». Même forme que la boutique : la
 * charge porte chaque texte avant et après, la phrase les COMPTE.
 */
const mailCopyPublished: Phrase = (fact) => {
  const version = typeof fact.payload['version'] === 'number' ? fact.payload['version'] : null;
  const { rewritten, restored } = publishedChanges(fact.payload['changes']);
  const parts = [
    rewritten === 0 ? null : countOf(rewritten, 'texte modifié', 'textes modifiés'),
    restored === 0
      ? null
      : countOf(restored, 'texte rendu à l’original', 'textes rendus à l’original'),
  ].flatMap((part) => (part === null ? [] : [part]));
  const listed = parts.flatMap((part, index) => (index === 0 ? [part] : [text(', '), part]));
  return byActor(
    fact,
    [
      text('a publié les textes des e-mails'),
      ...(version === null ? [] : [text(' (version '), value(String(version)), text(')')]),
      ...(listed.length === 0
        ? [text(', sans rien changer aux envois')]
        : [text(' : '), ...listed]),
    ],
    PUBLISHED_KEYS,
  );
};

const TRIAL_KEYS = ['subjectLabel', 'mail', 'locale', 'source'];

/** La langue d'un essai, en toutes lettres. */
const TRIAL_LOCALES: Readonly<Record<string, string>> = {
  fr: 'en français',
  en: 'en anglais',
  it: 'en italien',
};

/**
 * **Un essai d'e-mail envoyé** (`mail_copy.trial_sent`, C6) — à l'auteur
 * lui-même, et à lui seul.
 *
 * « Colette Martin s'est envoyé un essai de l'e-mail customer.order-placed,
 * en anglais, avec les brouillons ». La clé du registre est le seul nom
 * qu'un e-mail porte côté serveur : elle est citée comme une valeur.
 */
const mailCopyTrialSent: Phrase = (fact) => {
  const mail = typeof fact.payload['mail'] === 'string' ? fact.payload['mail'] : null;
  const locale = typeof fact.payload['locale'] === 'string' ? fact.payload['locale'] : '';
  const source =
    fact.payload['source'] === 'published' ? 'avec les textes publiés' : 'avec les brouillons';
  const said = TRIAL_LOCALES[locale];
  return byActor(
    fact,
    [
      text('s’est envoyé un essai de l’e-mail'),
      ...(mail === null ? [] : [text(' '), value(mail)]),
      ...(said === undefined ? [] : [text(`, ${said}`)]),
      text(`, ${source}`),
    ],
    TRIAL_KEYS,
  );
};

const DOCUMENT_SAVED_KEYS = ['subjectLabel', 'mail', 'revision'];
const DOCUMENT_PUBLISHED_KEYS = [
  'subjectLabel',
  'mail',
  'version',
  'previousVersion',
  'publicationVersion',
];
const DOCUMENT_RETRACTED_KEYS = ['subjectLabel', 'mail', 'version', 'publicationVersion'];

/** La clé de l'e-mail, citée comme une valeur — le seul nom qu'il porte côté serveur. */
const mailOf = (fact: Parameters<Phrase>[0]): readonly ReturnType<typeof text>[] => {
  const mail = typeof fact.payload['mail'] === 'string' ? fact.payload['mail'] : null;
  return mail === null ? [] : [text(' '), value(mail)];
};

/**
 * **Le brouillon d'un e-mail est enregistré** (`mail_copy.document_saved`,
 * S4c) : « Colette Martin a enregistré le brouillon de l'e-mail
 * customer.order-placed ».
 */
const mailDocumentSaved: Phrase = (fact) =>
  byActor(
    fact,
    [text('a enregistré le brouillon de l’e-mail'), ...mailOf(fact)],
    DOCUMENT_SAVED_KEYS,
  );

/**
 * **Un e-mail est publié** (`mail_copy.document_published`, S4c) : « Colette
 * Martin a publié l'e-mail customer.order-placed (version 2) ».
 */
const mailDocumentPublished: Phrase = (fact) => {
  const version = typeof fact.payload['version'] === 'number' ? fact.payload['version'] : null;
  return byActor(
    fact,
    [
      text('a publié l’e-mail'),
      ...mailOf(fact),
      ...(version === null ? [] : [text(' (version '), value(String(version)), text(')')]),
    ],
    DOCUMENT_PUBLISHED_KEYS,
  );
};

/**
 * **Un e-mail revient au modèle d'origine** (`mail_copy.document_retracted`,
 * S4c) : « Colette Martin a rendu l'e-mail customer.order-placed à son modèle
 * d'origine ».
 */
const mailDocumentRetracted: Phrase = (fact) =>
  byActor(
    fact,
    [text('a rendu l’e-mail'), ...mailOf(fact), text(' à son modèle d’origine')],
    DOCUMENT_RETRACTED_KEYS,
  );

const CHARTER_SAVED_KEYS = ['subjectLabel', 'space', 'revision'];
const CHARTER_PUBLISHED_KEYS = [
  'subjectLabel',
  'space',
  'version',
  'previousVersion',
  'publicationVersion',
];

/**
 * L'espace de la charte : son nom (`subjectLabel`, « La Folie Douce —
 * équipe »), sinon sa clé (`lfd`) citée comme une valeur.
 */
const spaceOf = (fact: Parameters<Phrase>[0]): readonly Segment[] => {
  const label = fact.payload['subjectLabel'];
  const space = fact.payload['space'];
  const named = typeof label === 'string' && label.trim() !== '' ? label : null;
  const key = typeof space === 'string' ? space : null;
  const said = named ?? key;
  return said === null ? [] : [text(' '), value(said)];
};

/**
 * **Le brouillon d'une charte est enregistré** (`mail_copy.charter_saved`,
 * plan-editeur-par-blocs.md § 25) : « Colette Martin a enregistré le
 * brouillon de la charte de l'espace La Folie Douce — équipe ».
 */
const mailCharterSaved: Phrase = (fact) =>
  byActor(
    fact,
    [text('a enregistré le brouillon de la charte de l’espace'), ...spaceOf(fact)],
    CHARTER_SAVED_KEYS,
  );

/**
 * **Une charte est publiée** (`mail_copy.charter_published`, § 25) :
 * « Colette Martin a publié la charte de l'espace La Folie Coffee — clients
 * (version 2) » — elle vaut pour tous les e-mails de l'espace.
 */
const mailCharterPublished: Phrase = (fact) => {
  const version = typeof fact.payload['version'] === 'number' ? fact.payload['version'] : null;
  return byActor(
    fact,
    [
      text('a publié la charte de l’espace'),
      ...spaceOf(fact),
      ...(version === null ? [] : [text(' (version '), value(String(version)), text(')')]),
    ],
    CHARTER_PUBLISHED_KEYS,
  );
};

const SENDER_CHANGED_KEYS = [
  'subjectLabel',
  'space',
  'revision',
  'senderName',
  'fromDomain',
  'publicationVersion',
];

/**
 * **L'expéditeur d'un espace change** (`mail_copy.sender_changed`, § 25, C3) :
 * « Colette Martin a changé l'expéditeur de l'espace La Folie Douce — équipe :
 * La Folie Douce, sur le domaine lfd-backoffice.com ». Le fait ne porte aucune
 * adresse, seulement le domaine.
 */
const mailSenderChanged: Phrase = (fact) => {
  const name = fact.payload['senderName'];
  const domain = fact.payload['fromDomain'];
  return byActor(
    fact,
    [
      text('a changé l’expéditeur de l’espace'),
      ...spaceOf(fact),
      ...(typeof name === 'string' && name.trim() !== '' ? [text(' : '), value(name)] : []),
      ...(typeof domain === 'string' && domain !== ''
        ? [text(', sur le domaine '), value(domain)]
        : []),
    ],
    SENDER_CHANGED_KEYS,
  );
};

const RECIPIENT_REVEALED_KEYS = ['subjectLabel', 'mail', 'space'];

/**
 * **L'adresse d'un envoi est révélée** (`mail.recipient_revealed`,
 * le-suivi-des-e-mails.md, décision 7) : « Colette Martin a affiché
 * l'adresse du destinataire d'un envoi de l'e-mail customer.order-ready ». Le
 * fait ne porte jamais l'adresse ; le sujet est l'envoi.
 */
const mailRecipientRevealed: Phrase = (fact) =>
  byActor(
    fact,
    [text('a affiché l’adresse du destinataire d’un envoi de l’e-mail'), ...mailOf(fact)],
    RECIPIENT_REVEALED_KEYS,
  );

/**
 * **Les envois d'une adresse sont cherchés** (`mail.recipient_searched`,
 * décision 8) : « Colette Martin a cherché les envois d'une adresse :
 * 2 envois trouvés ». Ni l'adresse ni son empreinte ne sont au journal.
 */
const mailRecipientSearched: Phrase = (fact) => {
  const found = typeof fact.payload['found'] === 'number' ? fact.payload['found'] : 0;
  return byActor(
    fact,
    [
      text('a cherché les envois d’une adresse : '),
      (found === 0 ? null : countOf(found, 'envoi trouvé', 'envois trouvés')) ??
        text('aucun envoi trouvé'),
    ],
    ['found'],
  );
};

/**
 * **L'adresse d'une ligne du registre de préférence est révélée**
 * (`mail.preference_recipient_revealed`, la-desinscription-et-l-accord.md,
 * C4) : « Colette Martin a affiché l'adresse d'une ligne des désinscriptions
 * et accords de l'espace lfc ». Le fait ne porte jamais l'adresse.
 */
const mailPreferenceRecipientRevealed: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a affiché l’adresse d’une ligne des désinscriptions et accords de l’espace'),
      ...spaceOf(fact),
    ],
    ['space'],
  );

/**
 * **Le staff désinscrit une adresse à la demande du client**
 * (`mail.marketing_unsubscribed_by_staff`, règle 8, C4) : « Colette Martin a
 * désinscrit une adresse des e-mails marketing de l'espace lfc, à la demande
 * du client » ; « (elle l'était déjà) » quand rien n'a changé.
 */
const mailMarketingUnsubscribedByStaff: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a désinscrit une adresse des e-mails marketing de l’espace'),
      ...spaceOf(fact),
      text(
        fact.payload['changed'] === false
          ? ', à la demande du client (elle l’était déjà)'
          : ', à la demande du client',
      ),
    ],
    ['space', 'changed'],
  );

/**
 * **Le registre est cherché par adresse** (`mail.preference_recipient_searched`,
 * C4) : « Colette Martin a cherché une adresse dans les désinscriptions et
 * accords : 1 ligne trouvée ». Ni l'adresse ni son empreinte au journal.
 */
const mailPreferenceRecipientSearched: Phrase = (fact) => {
  const found = typeof fact.payload['found'] === 'number' ? fact.payload['found'] : 0;
  return byActor(
    fact,
    [
      text('a cherché une adresse dans les désinscriptions et accords : '),
      (found === 0 ? null : countOf(found, 'ligne trouvée', 'lignes trouvées')) ??
        text('aucune ligne trouvée'),
    ],
    ['found'],
  );
};

export const STOREFRONT_PHRASES = {
  'storefront.saved': saved,
  'storefront.allergen_display_changed': allergenDisplayChanged,
  'shop_copy.published': shopCopyPublished,
  'mail_copy.published': mailCopyPublished,
  'mail_copy.trial_sent': mailCopyTrialSent,
  'mail_copy.document_saved': mailDocumentSaved,
  'mail_copy.document_published': mailDocumentPublished,
  'mail_copy.document_retracted': mailDocumentRetracted,
  'mail_copy.charter_saved': mailCharterSaved,
  'mail_copy.charter_published': mailCharterPublished,
  'mail_copy.sender_changed': mailSenderChanged,
  'mail.recipient_revealed': mailRecipientRevealed,
  'mail.recipient_searched': mailRecipientSearched,
  'mail.preference_recipient_revealed': mailPreferenceRecipientRevealed,
  'mail.marketing_unsubscribed_by_staff': mailMarketingUnsubscribedByStaff,
  'mail.preference_recipient_searched': mailPreferenceRecipientSearched,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
