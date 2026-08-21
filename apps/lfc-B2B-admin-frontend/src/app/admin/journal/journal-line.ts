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
    when: whenOf(event.occurredAt),
    actor: actorOf(event),
    forWhom: forWhomOf(event),
    blast: blastOf(event),
  };
}

/**
 * « 21 août 2026 à 14:32 ». Le journal affichait l'ISO brut, ce qui est lisible
 * par une machine et par personne d'autre — or il est fait pour être lu par des
 * humains. Heure **locale** : celui qui lit cherche « ce qui s'est passé ce
 * matin », pas un instant UTC.
 */
function whenOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(at);
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

function sentenceOf(event: ActivityEventView): string {
  const p = event.payload;
  switch (event.type) {
    case 'tax_rate.created':
      return `Taux de TVA « ${text(p['name'])} » créé à ${percent(p['percent'])}`;
    case 'tax_rate.rate_changed':
      return `Taux de « ${text(p['name'])} » passé de ${percent(p['from'])} à ${percent(p['to'])}`;
    case 'tax_rate.renamed':
      return `Taux « ${text(p['from'])} » renommé « ${text(p['to'])} »`;
    case 'tax_rate.deleted':
      return `Taux de TVA « ${text(p['name'])} » supprimé (${percent(p['percent'])})`;
    case 'category.tva_changed':
      return 'Taux de TVA d’une famille modifiés';
    case 'order.placed':
      // Le NUMÉRO d'abord : c'est par lui qu'on retrouve une commande, pas par
      // son identifiant technique.
      return `Commande ${text(p['orderNumber'])} passée`;
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

function text(value: unknown): string {
  return optional(value) ?? '—';
}

/** Une chaîne non vide, ou `null`. Le vide n'est pas une valeur à afficher. */
function optional(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** « 5,5 % ». Un taux absent rend `—` plutôt qu'un `NaN %`. */
function percent(value: unknown): string {
  return typeof value === 'number' ? `${value.toString().replace('.', ',')} %` : '—';
}

/** Un compte, ou `null` s'il n'a pas été figé. Zéro EST un compte. */
function count(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}
