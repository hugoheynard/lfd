import { optional, recordOf } from '../payload-read';
import { text, type PhraseFact, type Said } from '../phrase';

/**
 * « … via l’outil agent role_grant » au bout d'une phrase écrite par un outil
 * agent (plan `plan-outils-agent-droits.md`) : le geste n'a pas été cliqué.
 * L'auteur reste la personne connectée — c'est sa session qui a écrit.
 */
export function viaAgent(fact: PhraseFact, line: Said): Said {
  const tool = optional(recordOf(fact.payload['via'])?.['agentTool']);
  const mark = tool === null ? [] : [text(` via l’outil agent ${tool}`)];
  return {
    ...line,
    segments: [...line.segments, ...mark],
    consumed: [...line.consumed, 'via'],
  };
}
