import { isJournalFactType } from '@lfd/contracts/journal-facts';

import { factDetail, type DetailRow } from './detail-rows';
import { fallbackPhrase } from './fallback-phrase';
import type { Payload } from './payload-read';
import {
  actorSubject,
  plain,
  subject,
  subjectLabelOf,
  text,
  type ActorType,
  type PhraseFact,
  type Segment,
} from './phrase';
import { NO_RAW_DETAIL } from './phrases/accounts-phrases';
import { PHRASES } from './phrases/phrase-registry';

/**
 * **Le moteur de phrases** — un fait du journal devient ce qu'un humain lit :
 * une phrase en segments, et le détail de tout ce qu'elle n'a pas dit (plan
 * `documentation/journalisation/plan-phrases-du-journal.md`, lot C).
 *
 * Un point d'entrée pour les trois écrans qui relisent le journal — le Journal,
 * sa tranche fiscale, et l'historique d'une fiche : deux traductions d'un même
 * type finiraient par raconter deux histoires.
 *
 * 🔴 Ce fichier tire le catalogue des faits, donc zod : il ne s'importe que
 * depuis des routes paresseuses. Le bundle initial du back-office dépasse déjà
 * son budget.
 */

/** Ce qu'il faut d'un fait pour le raconter — la vue du Journal comme celle de l'historique. */
export interface FactInput {
  readonly type: string;
  readonly payload: Payload;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly actorName: string | null;
  readonly actorType: ActorType;
}

export interface RenderedFact {
  /** Le geste, en titre au-dessus de la phrase ; `null` quand la phrase suffit. */
  readonly title: string | null;
  readonly segments: readonly Segment[];
  /** La phrase en texte suivi. */
  readonly sentence: string;
  /** Vrai quand la phrase nomme déjà l'auteur : la ligne ne répète pas « par … ». */
  readonly namesActor: boolean;
  /** Tout ce que la phrase n'a pas dit, clé par clé. */
  readonly detail: readonly DetailRow[];
  /** Les clés de la charge que la phrase a dites (le sujet compris). */
  readonly consumed: readonly string[];
  /**
   * Les clés que le détail a rendues sous leur nom technique, faute de libellé
   * au dictionnaire. Vide si le test de clôture passe ; c'est lui qui la lit.
   */
  readonly unlabelled: readonly string[];
}

/**
 * Raconte un fait. `shownElsewhere` : les clés que la ligne affiche déjà hors de
 * la phrase (le client d'une commande, sur le Journal) — le détail ne les
 * répète pas.
 */
export function renderFact(fact: FactInput, shownElsewhere: readonly string[] = []): RenderedFact {
  const phraseFact: PhraseFact = {
    type: fact.type,
    payload: fact.payload,
    subjectType: fact.subjectType,
    subjectId: fact.subjectId,
    actor: actorSubject(fact.actorName, fact.actorType),
  };
  const phrase = isJournalFactType(fact.type) ? PHRASES[fact.type] : undefined;
  const said = (phrase ?? fallbackPhrase)(phraseFact);
  const named = withSubject(phraseFact, said.segments, said.consumed);
  const detail = factDetail(
    fact.type,
    fact.payload,
    new Set([...named.consumed, ...shownElsewhere]),
    {
      raw: !NO_RAW_DETAIL.has(fact.type),
    },
  );
  return {
    title: said.title,
    segments: named.segments,
    sentence: plain(named.segments),
    namesActor: said.namesActor,
    detail: detail.rows,
    consumed: named.consumed,
    unlabelled: detail.unlabelled,
  };
}

/**
 * Le sujet de la ligne, en gras, quand il a un nom (D6) et que la phrase ne l'a
 * pas dit : « Commande ORD-142 passée — Jean Dupont ». Une ligne ne perd pas le
 * nom de ce dont elle parle parce que sa phrase regardait ailleurs.
 */
function withSubject(
  fact: PhraseFact,
  segments: readonly Segment[],
  consumed: readonly string[],
): { readonly segments: readonly Segment[]; readonly consumed: readonly string[] } {
  const label = subjectLabelOf(fact);
  if (label === null || consumed.includes('subjectLabel')) {
    return { segments, consumed };
  }
  return {
    segments: [...segments, text(' — '), subject(fact, label)],
    consumed: [...consumed, 'subjectLabel'],
  };
}
