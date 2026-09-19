import type { ActivityEventView, ActivityModule } from '@lfd/contracts';

import { count, optional } from '../../shared/journal/payload-read';
import { actorBy } from '../../shared/journal/phrase';
import { renderFact } from '../../shared/journal/render-fact';
import { factWhen } from '../../shared/journal/units';

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
  const fact = renderFact(event, forWhom === '' ? [] : CLIENT_KEYS);
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
    blast: blastOf(event),
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
 * La portée, telle qu'elle a été figée. On n'affiche que ce qui a été compté —
 * une portée absente n'est pas un zéro, c'est un fait qui n'en avait pas.
 */
function blastOf(event: ActivityEventView): string {
  const blast = event.payload['blast'];
  if (typeof blast !== 'object' || blast === null || Array.isArray(blast)) {
    return '';
  }
  const counts: Record<string, unknown> = { ...blast };
  const parts: string[] = [];
  const emporter = count(counts['familiesEmporter']);
  const surPlace = count(counts['familiesSurPlace']);
  const variants = count(counts['variants']);
  if (emporter !== null) {
    parts.push(`${emporter} famille(s) à emporter`);
  }
  if (surPlace !== null) {
    parts.push(`${surPlace} sur place`);
  }
  if (variants !== null) {
    parts.push(`${variants} article(s)`);
  }
  return parts.join(' · ');
}
