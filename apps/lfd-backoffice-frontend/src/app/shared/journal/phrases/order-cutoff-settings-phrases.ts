import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import { byActor, text, type Phrase, type PhraseFact, type Segment } from '../phrase';

/**
 * **L'interrupteur de l'heure limite générale** (lot O3 de
 * `plan-reglages-commandes.md`, 2026-10-14) — le miroir de
 * `order_cutoff_settings.updated` dans `@lfd/contracts`.
 *
 * La charge porte l'état posé ; la phrase dit l'effet, pas la case : une
 * heure limite désactivée laisse passer les commandes tardives jusqu'à l'arrêt
 * du plan.
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

/** La charge porte l'avant et l'après des deux réglages. */
function readable(fact: PhraseFact): boolean {
  return change(fact, 'enabled') !== null && change(fact, 'sameDayAllowed') !== null;
}

function orderCutoffSettings(fact: PhraseFact): Segment[] {
  const said = changes(fact);
  if (said.length > 0) {
    return [text(said.join(' et '))];
  }
  return [
    text(
      readable(fact)
        ? 'a réglé l’heure limite de commande sans la changer'
        : 'a réglé l’heure limite de commande',
    ),
  ];
}

export const ORDER_CUTOFF_SETTINGS_PHRASES = {
  'order_cutoff_settings.updated': (fact) =>
    byActor(
      fact,
      orderCutoffSettings(fact),
      readable(fact) ? ['enabled', 'sameDayAllowed', 'previous'] : [],
    ),
} satisfies Partial<Record<JournalFactType, Phrase>>;
