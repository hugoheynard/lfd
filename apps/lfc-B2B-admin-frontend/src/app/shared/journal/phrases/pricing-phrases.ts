import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional } from '../payload-read';
import { said, text, type Phrase } from '../phrase';

/**
 * **Les actes de tarification** — repris de `factSentence` (`pricingSentence`,
 * plan des phrases, lot C, 2026-09-19).
 *
 * Ils portent déjà leur phrase — figée au moment de l'acte par le domaine, qui
 * seul sait dire ce que la règle affirmait. On ne la reconstruit pas : on la
 * lit, et on préfixe par le nom et le verbe. Une phrase recalculée aujourd'hui
 * pour un acte d'hier raconterait l'histoire à l'envers.
 *
 * Seules les combinaisons sujet × verbe que le catalogue déclare ont une
 * entrée : ce sont les seules qui s'écrivent. Les mercuriales n'en avaient pas
 * dans `factSentence` ; elles ont le repli du moteur jusqu'au lot D.
 */
function act(noun: string, verb: string): Phrase {
  return (fact) => {
    const summary = optional(fact.payload['summary']);
    const reason = optional(fact.payload['reason']);
    // Le motif écrit par l'agent : c'est souvent la seule phrase qui explique
    // pourquoi un prix a cessé de s'appliquer.
    return said(
      [
        text(
          `${noun} ${verb}${summary === null ? '' : ` — ${summary}`}${reason === null ? '' : ` (${reason})`}`,
        ),
      ],
      ['summary', 'reason'],
    );
  };
}

const RULE = 'Règle de prix';
const FLOOR = 'Limite de prix';
const LADDER = 'Barème de volume';

export const PRICING_PHRASES = {
  'price_rule.posed': act(RULE, 'posée'),
  'price_rule.paused': act(RULE, 'suspendue'),
  'price_rule.resumed': act(RULE, 'reprise'),
  'price_rule.archived': act(RULE, 'archivée'),
  'price_rule.renamed': act(RULE, 'renommée'),
  'price_floor.posed': act(FLOOR, 'posée'),
  'price_floor.replaced': act(FLOOR, 'remplacée'),
  'price_floor.archived': act(FLOOR, 'archivée'),
  'price_floor.confirmed': act(FLOOR, 'confirmée'),
  'volume_ladder.posed': act(LADDER, 'posée'),
  'volume_ladder.paused': act(LADDER, 'suspendue'),
  'volume_ladder.resumed': act(LADDER, 'reprise'),
  'volume_ladder.archived': act(LADDER, 'archivée'),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
