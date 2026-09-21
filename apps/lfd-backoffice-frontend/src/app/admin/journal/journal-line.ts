import type { ActivityEventView, ActivityModule } from '@lfd/contracts';

import { contextWord } from '../../shared/journal/context-word';
import { count, optional, recordOf, type Payload } from '../../shared/journal/payload-read';
import { actorBy, inSentence } from '../../shared/journal/phrase';
import { renderFact } from '../../shared/journal/render-fact';
import { factWhen, formatCount, formatNumber } from '../../shared/journal/units';

import type { JournalLine } from './journal.service';

/**
 * Le nom lisible de chaque module. Le badge affichait la clé brute (`comptes`,
 * `pim`) : une valeur de contrat, pas un mot pour celui qui lit. Un `Record`
 * exhaustif : un module ajouté au contrat ne compile pas tant qu'il n'a pas
 * son libellé ici.
 */
export const MODULE_LABELS: Readonly<Record<ActivityModule, string>> = {
  pim: 'Référentiel',
  commercial: 'Commercial',
  commandes: 'Commandes',
  comptes: 'Comptes clients',
  equipe: 'Équipe',
  production: 'Production',
  comptabilite: 'Comptabilité',
};

/** Les clés que la ligne affiche hors de la phrase : le client d'une commande. */
const CLIENT_KEYS = ['clientName', 'clientLegalName'];

/** La portée, quand la méta la dit : le détail ne la répète pas. */
const BLAST_KEY = 'blast';

/**
 * Traduit un fait du journal en **ligne** : la phrase du moteur
 * (`shared/journal/render-fact.ts`), son détail, et la méta — quand, par qui,
 * pour qui.
 *
 * Le journal stocke des types et des payloads ; un écran qui les affiche tels
 * quels oblige son lecteur à faire la traduction de tête, à chaque ligne. Le
 * type reste visible à côté — c'est lui qui sert à filtrer — mais ce qu'on lit
 * d'abord est ce qui s'est passé. Un type que l'écran ne connaît pas encore a
 * le repli du moteur, jamais son code seul.
 */
export function toLine(event: ActivityEventView): JournalLine {
  const forWhom = forWhomOf(event);
  const blast = blastOf(event.payload);
  const fact = renderFact(event, [
    ...(forWhom === '' ? [] : CLIENT_KEYS),
    ...(blast === '' ? [] : [BLAST_KEY]),
  ]);
  return {
    event,
    title: fact.title ?? '',
    segments: fact.segments,
    sentence: fact.sentence,
    detail: fact.detail,
    // Une phrase à la voix active nomme déjà l'auteur : la méta ne le répète pas.
    sentenceNamesActor: fact.namesActor,
    moduleLabel: event.module === null ? '' : MODULE_LABELS[event.module],
    when: factWhen(event.occurredAt),
    actor: actorBy(event.actorName, event.actorRole, event.actorType),
    forWhom,
    blast,
  };
}

/**
 * Pour qui — le client, tel qu'il a été figé dans le fait.
 *
 * L'enseigne d'abord, la raison sociale entre parenthèses **si elle diffère** :
 * répéter « Boulangerie Martin (Boulangerie Martin) » n'apprend rien.
 */
function forWhomOf(event: ActivityEventView): string {
  const name = optional(event.payload['clientName']);
  if (name === null) {
    return '';
  }
  const legal = optional(event.payload['clientLegalName']);
  return legal === null || legal === name ? name : `${name} (${legal})`;
}

/**
 * La portée, telle qu'elle a été figée : « touche 12 familles à emporter,
 * 3 sur place, 40 articles ». On n'affiche que ce qui a été compté — une
 * portée absente n'est pas un zéro, c'est un fait qui n'en avait pas.
 *
 * Trois formes en base (vérifié le 2026-09-19) :
 *
 * - `{ families: { <contexte>: n }, variants?, articles? }` — depuis le
 *   2026-08-24 (`5d526662`), la forme du catalogue (`blast()`) ;
 * - `{ familiesEmporter, familiesSurPlace, familiesB2b }` — du 2026-08-21
 *   (`6959131d`) au 2026-08-24. Le catalogue ne la connaît PAS : une telle
 *   ligne ne répond à aucune de ses formes, et c'est ici seulement qu'on la lit ;
 * - les clés de contexte `emporter` / `surPlace` d'avant le 2026-08-26, que la
 *   migration de renommage n'a pas reprises dans les charges.
 */
function blastOf(payload: Payload): string {
  const blast = recordOf(payload[BLAST_KEY]);
  if (blast === null) {
    return '';
  }
  const families = familyCounts(blast).map(
    ([context, n], index) =>
      `${index === 0 ? formatCount(n, 'famille', 'familles') : formatNumber(n)} ${contextOf(payload, context)}`,
  );
  const articles = [count(blast['variants']), count(blast['articles'])]
    .filter((n): n is number => n !== null)
    .map((n) => formatCount(n, 'article', 'articles'));
  const parts = [...families, ...articles];
  return parts.length === 0 ? '' : `touche ${parts.join(', ')}`;
}

/** Les champs nommés de la forme d'août, et la clé de contexte que chacun comptait. */
const LEGACY_FAMILY_FIELDS: readonly (readonly [string, string])[] = [
  ['familiesEmporter', 'emporter'],
  ['familiesSurPlace', 'surPlace'],
  ['familiesB2b', 'b2b'],
];

/** Les familles comptées, par clé de contexte de vente — dans l'ordre de la charge. */
function familyCounts(blast: Payload): readonly (readonly [string, number])[] {
  const byContext = recordOf(blast['families']);
  const current = byContext === null ? [] : Object.entries(byContext);
  const legacy = LEGACY_FAMILY_FIELDS.map(([field, context]) => [context, blast[field]] as const);
  return [...current, ...legacy].flatMap(([context, raw]) => {
    const n = count(raw);
    return n === null ? [] : [[context, n] as const];
  });
}

/**
 * « à emporter » — par le libellé figé dans la charge, puis le dictionnaire
 * (`contextWord`) ; un contexte créé à l'écran avant `contextLabels` garde sa clé.
 */
function contextOf(payload: Payload, key: string): string {
  return inSentence(contextWord(payload, key) ?? key);
}
