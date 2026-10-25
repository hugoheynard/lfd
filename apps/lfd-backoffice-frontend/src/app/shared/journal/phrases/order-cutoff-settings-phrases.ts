import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import { byActor, text, type Phrase, type PhraseFact, type Segment } from '../phrase';

/**
 * **Le jour même, et l'interrupteur retiré** — le miroir de
 * `order_cutoff_settings.updated` dans `@lfd/contracts`.
 *
 * Depuis le 2026-10-21, la charge porte le jour même et l'heure limite du
 * réassort boutique (`resupplyCutoffTime`, lot R3a) ; les lignes du même jour
 * d'avant R3a portent l'interrupteur `resupplySubjectToCutoff`, celles d'avant
 * aussi `enabled` (l'interrupteur de l'heure limite générale, lot O3), et leur
 * phrase le dit toujours.
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
  const resupply = change(fact, 'resupplySubjectToCutoff');
  if (resupply !== null && resupply.before !== resupply.after) {
    said.push(
      resupply.after
        ? 'a soumis le réassort boutique à l’heure limite générale'
        : 'a levé l’heure limite pour le réassort boutique',
    );
  }
  const time = timeChange(fact);
  if (time !== null && time.before !== time.after) {
    said.push(`a réglé l’heure limite du réassort boutique à la veille, ${time.after}`);
  }
  for (const [key, gesture] of NUDGE_DELAYS) {
    const delay = minutesChange(fact, key);
    if (delay !== null && delay.before !== delay.after) {
      said.push(`a réglé « ${gesture} » à ${String(delay.after)} min après la fin du créneau`);
    }
  }
  return said;
}

/** Les délais des deux relances d'un retrait en retard (2026-10-25), et le nom de leur geste. */
const NUDGE_DELAYS = [
  ['pickupReminderDelayMinutes', 'Rappel au client'],
  ['delayWarningDelayMinutes', 'Avertir le client'],
] as const;

/** L'avant et l'après d'un délai en minutes, ou `null` (ligne d'avant le 2026-10-25). */
function minutesChange(fact: PhraseFact, key: string): { before: number; after: number } | null {
  const before = recordOf(fact.payload['previous'])?.[key];
  const after = fact.payload[key];
  return typeof before === 'number' && typeof after === 'number' ? { before, after } : null;
}

/** L'avant et l'après de l'heure du réassort (lot R3a), ou `null`. */
function timeChange(fact: PhraseFact): { before: string; after: string } | null {
  const before = recordOf(fact.payload['previous'])?.['resupplyCutoffTime'];
  const after = fact.payload['resupplyCutoffTime'];
  return typeof before === 'string' && typeof after === 'string' ? { before, after } : null;
}

/** La charge porte au moins l'avant et l'après du jour même. */
function readable(fact: PhraseFact): boolean {
  return change(fact, 'sameDayAllowed') !== null;
}

/**
 * Les clés que la phrase a dites : `enabled` seulement sur une ligne d'avant le
 * 2026-10-21, `resupplySubjectToCutoff` seulement sur une ligne du même jour
 * d'avant le lot R3a, `resupplyCutoffTime` sur une ligne d'après, et les
 * deux délais de relance sur une ligne d'après le 2026-10-25.
 */
function saidKeys(fact: PhraseFact): string[] {
  if (!readable(fact)) {
    return [];
  }
  const optional = ['enabled', 'resupplySubjectToCutoff'].filter(
    (key) => change(fact, key) !== null,
  );
  const time = timeChange(fact) === null ? [] : ['resupplyCutoffTime'];
  const delays = NUDGE_DELAYS.map(([key]) => key).filter(
    (key) => minutesChange(fact, key) !== null,
  );
  return [...optional, ...time, ...delays, 'sameDayAllowed', 'previous'];
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
