import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf } from '../payload-read';
import { byActor, text, type Phrase, type PhraseFact, type Segment } from '../phrase';

/**
 * **Où le contrôle qualité se rend** — le miroir de
 * `production_quality_settings.updated` dans `@lfd/contracts` (Réglages ›
 * Commandes, décision de Hugo, 2026-10-26). La charge dit l'état posé et
 * celui qu'il remplace ; la phrase ne dit que ce qui a changé.
 */
const LEVELS = [
  ['lineChecks', 'le contrôle qualité au fournil'],
  ['orderChecks', 'le contrôle qualité au colisage'],
] as const;

/** L'avant et l'après d'un niveau, ou `null` si la charge ne les porte pas. */
function change(fact: PhraseFact, key: string): { before: boolean; after: boolean } | null {
  const before = recordOf(fact.payload['previous'])?.[key];
  const after = fact.payload[key];
  return typeof before === 'boolean' && typeof after === 'boolean' ? { before, after } : null;
}

function qualityControlSettings(fact: PhraseFact): Segment[] {
  const said = LEVELS.flatMap(([key, level]) => {
    const moved = change(fact, key);
    if (moved === null || moved.before === moved.after) {
      return [];
    }
    return [`${moved.after ? 'a activé' : 'a désactivé'} ${level}`];
  });
  return [text(said.length > 0 ? said.join(' et ') : 'a réglé le contrôle qualité')];
}

export const QUALITY_CONTROL_SETTINGS_PHRASES = {
  'production_quality_settings.updated': (fact) =>
    byActor(fact, qualityControlSettings(fact), ['lineChecks', 'orderChecks', 'previous']),
} satisfies Partial<Record<JournalFactType, Phrase>>;
