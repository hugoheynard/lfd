import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import { byActor, text, type Phrase, type PhraseFact, type Segment } from '../phrase';

/**
 * **Le jour même, et l'interrupteur retiré** — le miroir de
 * `order_cutoff_settings.updated` dans `@lfd/contracts`.
 *
 * Depuis le 2026-10-21, la charge ne porte plus que le jour même ; les lignes
 * d'avant portent aussi `enabled` (l'interrupteur de l'heure limite générale,
 * lot O3), et leur phrase le dit toujours.
 */
/** L'avant et l'après d'une clé booléenne, ou `null` si la charge ne les porte pas. */
function change(fact: PhraseFact, key: string): { before: boolean; after: boolean } | null {
  const before = recordOf(fact.payload['previous'])?.[key];
  const after = fact.payload[key];
  return typeof before === 'boolean' && typeof after === 'boolean' ? { before, after } : null;
}

/** Les phrases des clés qui ont changé, dans l'ordre de l'écran. */
function changes(fact: PhraseFact): string[] {
  const said: string[] = [];
  const enabled = change(fact, 'enabled');
  if (enabled !== null && enabled.before !== enabled.after) {
    said.push(
      enabled.after
        ? 'a réactivé l’heure limite générale de commande'
        : 'a désactivé l’heure limite générale de commande ; seuls l’arrêt du plan et les limites des articles ferment encore une journée',
    );
  }
  const sameDay = change(fact, 'sameDayAllowed');
  if (sameDay !== null && sameDay.before !== sameDay.after) {
    said.push(
      sameDay.after
        ? 'a autorisé les commandes pour le jour même'
        : 'a fermé les commandes pour le jour même',
    );
  }
  return said;
}

/** La charge porte au moins l'avant et l'après du jour même. */
function readable(fact: PhraseFact): boolean {
  return change(fact, 'sameDayAllowed') !== null;
}

/** Les clés que la phrase a dites : `enabled` seulement sur une ligne d'avant le 2026-10-21. */
function saidKeys(fact: PhraseFact): string[] {
  if (!readable(fact)) {
    return [];
  }
  return change(fact, 'enabled') === null
    ? ['sameDayAllowed', 'previous']
    : ['enabled', 'sameDayAllowed', 'previous'];
}

function orderCutoffSettings(fact: PhraseFact): Segment[] {
  const said = changes(fact);
  if (said.length > 0) {
    return [text(said.join(' et '))];
  }
  return [text(readable(fact) ? 'a réglé le jour même sans le changer' : 'a réglé le jour même')];
}

export const ORDER_CUTOFF_SETTINGS_PHRASES = {
  'order_cutoff_settings.updated': (fact) =>
    byActor(fact, orderCutoffSettings(fact), saidKeys(fact)),
} satisfies Partial<Record<JournalFactType, Phrase>>;
