import type { ActivityEventView, ActivityModule } from '@lfd/contracts';

import { count, factSentence, factWhen, optional } from '../../shared/journal-fact';

import type { JournalLine } from './journal.service';
import { staffLineOf } from './staff-line';

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
};

/**
 * Traduit un fait du journal en **phrase**.
 *
 * Le journal stocke des types et des payloads ; un écran qui les affiche tels
 * quels oblige son lecteur à faire la traduction de tête, à chaque ligne. Le
 * type reste visible à côté — c'est lui qui sert à filtrer — mais ce qu'on lit
 * d'abord est ce qui s'est passé.
 *
 * Un type inconnu n'est pas une erreur : le journal est ouvert, un module peut
 * en émettre un que cet écran ne connaît pas encore. On rend alors le type
 * lui-même, ce qui reste vrai.
 */
export function toLine(event: ActivityEventView): JournalLine {
  // Les faits de l'équipe se lisent en titre + phrase à la voix active, qui
  // nomme déjà l'auteur : la méta ne le répète pas.
  const staff = staffLineOf(event);
  return {
    event,
    title: staff?.title ?? '',
    sentence: staff?.sentence ?? factSentence(event),
    sentenceNamesActor: staff !== null,
    moduleLabel: event.module === null ? '' : MODULE_LABELS[event.module],
    when: factWhen(event.occurredAt),
    actor: actorOf(event),
    forWhom: forWhomOf(event),
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

/**
 * Qui a agi. Le nom a été figé au moment de l'acte ; quand l'annuaire ne le
 * connaissait pas, on rend sa **nature** — ce qui reste vrai — plutôt qu'un
 * identifiant technique au milieu d'une phrase.
 */
function actorOf(event: ActivityEventView): string {
  const name = optional(event.actorName);
  if (name !== null) {
    // La fonction entre parenthèses : « qui a fait ça, et à quel titre » est la
    // question qu'on pose à un journal.
    const role = optional(event.actorRole);
    return role === null ? name : `${name} (${role})`;
  }
  switch (event.actorType) {
    case 'staff':
      return 'un membre de l’équipe';
    case 'customer':
      return 'un client';
    default:
      return 'le système';
  }
}
