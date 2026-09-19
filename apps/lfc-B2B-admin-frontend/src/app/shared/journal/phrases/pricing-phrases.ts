import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional } from '../payload-read';
import {
  byActor,
  subject,
  subjectLabelOf,
  text,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **Les actes de tarification** — règles, limites, barèmes, mercuriales (lot D
 * du plan des phrases, 2026-09-19).
 *
 * Chaque acte porte déjà sa phrase (`summary`) — figée au moment de l'acte par
 * le domaine, qui seul sait dire ce que la décision affirmait : l'effet, la
 * cible, le client, la fenêtre, avec leurs montants. On ne la reconstruit pas :
 * une phrase recalculée aujourd'hui pour un acte d'hier raconterait l'histoire
 * à l'envers. On la **cite**, derrière l'auteur, le verbe et le sujet que le
 * moteur dit comme partout ailleurs.
 *
 * Le motif (`reason`) reste au détail, sous « Motif » : il est souvent long, et
 * pour une mercuriale c'est une phrase écrite par le serveur.
 *
 * Seules les combinaisons sujet × verbe que le catalogue déclare ont une
 * entrée : ce sont les seules qui s'écrivent.
 */

/** Comment le sujet d'un acte se dit, devant son libellé ou seul. */
interface ActSubject {
  /** « la règle de prix » — devant le libellé entre guillemets. */
  readonly the: string;
  /** « une règle de prix » — sur une ligne d'avant le lot B, sans libellé. */
  readonly a: string;
}

const RULE: ActSubject = { the: 'la règle de prix', a: 'une règle de prix' };
const LADDER: ActSubject = { the: 'le barème de volume', a: 'un barème de volume' };
const MERCURIALE: ActSubject = { the: 'la mercuriale', a: 'une mercuriale' };

/** « la règle de prix « Été » », ou « une règle de prix » sans libellé. */
function named(fact: PhraseFact, noun: ActSubject): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text(noun.a)]
    : [text(`${noun.the} « `), subject(fact, label), text(' »')];
}

/**
 * Un renommage : « une règle de prix en « Automne » ». Le libellé porté est le
 * NOUVEAU, et la phrase figée décrit la décision d'AVANT le renommage — c'est
 * elle qui dit l'ancien nom (`rename-price-rule`, `rename-company-mercuriale`,
 * lus le 2026-09-19).
 */
function renamedTo(fact: PhraseFact, noun: ActSubject): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text(noun.a)]
    : [text(`${noun.a} en « `), subject(fact, label), text(' »')];
}

/**
 * Le sujet d'une limite est sa PORTÉE, déjà dite en mots par le domaine
 * (`describeScope`, lu le 2026-09-19) : « tout le catalogue », « famille
 * « Tartes » », « produit « Tarte citron » », « déclinaison … ». Elle porte ses
 * propres guillemets ; on ne lui ajoute que l'article.
 */
const SCOPE_ARTICLES: Readonly<Record<string, string>> = {
  famille: 'la ',
  produit: 'le ',
  déclinaison: 'la ',
};

function floorScope(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  if (label === null) {
    return [text('une limite de prix')];
  }
  const first = label.split(' ')[0] ?? '';
  const article = Object.hasOwn(SCOPE_ARTICLES, first) ? SCOPE_ARTICLES[first] : '';
  return [text(`la limite de prix sur ${article ?? ''}`), subject(fact, label)];
}

/**
 * « Colette Martin a posé la règle de prix « Été » : Geste « Été » · −10 % · … ».
 *
 * La phrase figée nomme déjà le client visé quand il y en a un (`describeRule`,
 * « client « Café des Halles » ») : `audience` y est dite, elle ne se répète
 * pas au détail. Sans phrase figée (une charge qui n'en porterait pas), le
 * client reste au détail.
 */
function act(verb: string, object: (fact: PhraseFact) => Segment[]): Phrase {
  return (fact) => {
    const summary = optional(fact.payload['summary']);
    return byActor(
      fact,
      [text(`${verb} `), ...object(fact), ...(summary === null ? [] : [text(` : ${summary}`)])],
      summary === null ? ['subjectLabel'] : ['subjectLabel', 'summary', 'audience'],
    );
  };
}

const rule = (fact: PhraseFact) => named(fact, RULE);
const ladder = (fact: PhraseFact) => named(fact, LADDER);
const mercuriale = (fact: PhraseFact) => named(fact, MERCURIALE);

export const PRICING_PHRASES = {
  'price_rule.posed': act('a posé', rule),
  'price_rule.paused': act('a suspendu', rule),
  'price_rule.resumed': act('a repris', rule),
  'price_rule.archived': act('a archivé', rule),
  'price_rule.renamed': act('a renommé', (fact) => renamedTo(fact, RULE)),
  'price_floor.posed': act('a posé', floorScope),
  'price_floor.replaced': act('a remplacé', floorScope),
  'price_floor.archived': act('a archivé', floorScope),
  'price_floor.confirmed': act('a confirmé', floorScope),
  'volume_ladder.posed': act('a posé', ladder),
  'volume_ladder.paused': act('a suspendu', ladder),
  'volume_ladder.resumed': act('a repris', ladder),
  'volume_ladder.archived': act('a archivé', ladder),
  'company_mercuriale.posed': act('a posé', mercuriale),
  'company_mercuriale.archived': act('a archivé', mercuriale),
  'company_mercuriale.renamed': act('a renommé', (fact) => renamedTo(fact, MERCURIALE)),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
