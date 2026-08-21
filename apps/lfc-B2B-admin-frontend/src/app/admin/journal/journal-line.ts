import type { ActivityEventView } from '@lfd/contracts';

import type { JournalLine } from './journal.service';

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
  return {
    event,
    sentence: sentenceOf(event),
    blast: blastOf(event),
    actor: actorOf(event),
  };
}

function sentenceOf(event: ActivityEventView): string {
  const p = event.payload;
  switch (event.type) {
    case 'tax_regime.created':
      return `Régime de TVA « ${text(p['name'])} » créé à ${percent(p['percent'])}`;
    case 'tax_regime.rate_changed':
      return `Taux de « ${text(p['name'])} » passé de ${percent(p['from'])} à ${percent(p['to'])}`;
    case 'tax_regime.renamed':
      return `Régime « ${text(p['from'])} » renommé « ${text(p['to'])} »`;
    case 'tax_regime.deleted':
      return `Régime de TVA « ${text(p['name'])} » supprimé (${percent(p['percent'])})`;
    case 'category.tva_changed':
      return 'Régimes de TVA d’une famille modifiés';
    case 'product.published':
      return `Produit « ${text(p['name'])} » mis en vente (${text(p['sku'])})`;
    case 'product.unpublished':
      return `Produit « ${text(p['name'])} » retiré de la vente (${text(p['sku'])})`;
    default:
      return event.type;
  }
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
  if (event.actorName !== null && event.actorName !== '') {
    return event.actorName;
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

function text(value: unknown): string {
  return typeof value === 'string' && value !== '' ? value : '—';
}

/** « 5,5 % ». Un taux absent rend `—` plutôt qu'un `NaN %`. */
function percent(value: unknown): string {
  return typeof value === 'number' ? `${value.toString().replace('.', ',')} %` : '—';
}

/** Un compte, ou `null` s'il n'a pas été figé. Zéro EST un compte. */
function count(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}
