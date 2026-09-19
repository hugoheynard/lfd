import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional } from '../payload-read';
import {
  byActor,
  name,
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
 * moteur dit comme partout ailleurs — sans répéter le nom qu'elle porte en
 * tête quand la phrase vient de le dire.
 *
 * Le motif (`reason`) est dit en fin de phrase : c'est ce que l'humain a écrit
 * pour expliquer son geste.
 *
 * Seules les combinaisons sujet × verbe que le catalogue déclare ont une
 * entrée : ce sont les seules qui s'écrivent.
 */

/** Comment le sujet d'un acte se dit. */
interface ActSubject {
  /** « la règle de prix » — devant le libellé entre guillemets. */
  readonly the: string;
  /** « une règle de prix » — sur une ligne d'avant le lot B, sans libellé. */
  readonly a: string;
  /**
   * Le mot par lequel la phrase figée ouvre sur le nom (« Barème « Gros
   * volumes » · … ») : il ne dit que ce que la phrase vient de dire, et tombe
   * avec le nom. `null` quand ce mot apprend autre chose — l'étage d'une règle
   * (« Geste « Été » »), qui reste.
   */
  readonly lead: string | null;
}

const RULE: ActSubject = { the: 'la règle de prix', a: 'une règle de prix', lead: null };
const LADDER: ActSubject = { the: 'le barème de volume', a: 'un barème de volume', lead: 'Barème' };
const MERCURIALE: ActSubject = { the: 'la mercuriale', a: 'une mercuriale', lead: 'Mercuriale' };

/**
 * La tête d'une phrase figée : « Geste « Été » · −10 % · … » →
 * `{ head: 'Geste', name: 'Été', rest: '−10 % · …' }`. Le nom n'est lu que dans
 * le PREMIER membre (avant tout « · » ou « — ») : un nom cité plus loin est
 * celui d'une famille ou d'un client.
 *
 * Les formes lues le 2026-09-19 dans `pricing-act-summary.ts` (`describeRule`,
 * `describeLadder`) et `company-mercuriale-support.ts` (`describeMercuriale`).
 * Une phrase d'une autre forme n'a pas de tête : elle se cite entière.
 */
interface Lead {
  readonly head: string;
  readonly name: string;
  readonly rest: string;
}

const LEAD = /^([^«·—]*?)\s*« ([^«»]+?) »(?:\s*[·—,:]\s*|$)([\s\S]*)$/u;

function leadOf(summary: string): Lead | null {
  const match = LEAD.exec(summary);
  if (match === null) {
    return null;
  }
  const [, head = '', called = '', rest = ''] = match;
  return { head: head.trim(), name: called, rest: rest.trim() };
}

/** Ce qui reste de la phrase figée une fois son nom dit : l'étage d'une règle, puis le reste. */
function tailOf(lead: Lead, noun: ActSubject): string {
  const head =
    noun.lead !== null && lead.head.toLowerCase() === noun.lead.toLowerCase() ? '' : lead.head;
  return [head, lead.rest].filter((part) => part !== '').join(' · ');
}

/** « la règle de prix « Été » », ou « une règle de prix » sans libellé. */
function named(fact: PhraseFact, noun: ActSubject): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text(noun.a)]
    : [text(`${noun.the} « `), subject(fact, label), text(' »')];
}

/**
 * Le motif — sauf quand le serveur y a écrit sa propre paraphrase du geste
 * (`rename-company-mercuriale`, `pose-company-mercuriale`, lus le 2026-09-19) :
 * la phrase vient de le dire, mot pour mot. Un motif écrit par un humain,
 * ou par un gabarit (« Posée par le gabarit « Club » »), se dit toujours.
 */
function motive(fact: PhraseFact, previous: string | null): Segment[] {
  const reason = optional(fact.payload['reason']);
  if (reason === null) {
    return [];
  }
  const label = subjectLabelOf(fact);
  const echoes = [
    `Mercuriale « ${label ?? ''} » posée sur la fiche du compte`,
    `Mercuriale « ${previous ?? ''} » renommée « ${label ?? ''} »`,
  ];
  return label !== null && echoes.includes(reason) ? [] : [text(` — motif : ${reason}`)];
}

/** Les clés qu'un acte a dites : la phrase figée nomme le client visé (`describeRule`). */
function actConsumed(summary: string | null): string[] {
  return summary === null
    ? ['subjectLabel', 'reason']
    : ['subjectLabel', 'summary', 'audience', 'reason'];
}

/**
 * « Colette Martin a posé la règle de prix « Été » : Geste · −10 % · famille
 * « Tartes », client « Café des Halles » · du 01/09/2026 au 30/09/2026 — motif :
 * Fidélité ».
 *
 * La phrase figée nomme déjà le client visé quand il y en a un (`describeRule`,
 * « client « Café des Halles » ») : `audience` y est dite, elle ne se répète
 * pas au détail. Sans phrase figée (une charge qui n'en porterait pas), le
 * client reste au détail.
 */
function act(verb: string, noun: ActSubject): Phrase {
  return (fact) => {
    const summary = optional(fact.payload['summary']);
    const lead = summary === null ? null : leadOf(summary);
    const said = lead !== null && lead.name === subjectLabelOf(fact) ? tailOf(lead, noun) : summary;
    return byActor(
      fact,
      [
        text(`${verb} `),
        ...named(fact, noun),
        ...(said === null || said === '' ? [] : [text(` : ${said}`)]),
        ...motive(fact, null),
      ],
      actConsumed(summary),
    );
  };
}

/**
 * Un renommage : « a renommé la règle de prix « Été » en « Automne » : Geste
 * · … ». Le libellé porté est le NOUVEAU, et la phrase figée décrit la
 * décision d'AVANT le renommage — c'est elle qui dit l'ancien nom
 * (`rename-price-rule`, `rename-company-mercuriale`, lus le 2026-09-19).
 */
function renamed(noun: ActSubject): Phrase {
  return (fact) => {
    const label = subjectLabelOf(fact);
    const summary = optional(fact.payload['summary']);
    const lead = summary === null ? null : leadOf(summary);
    const to = label === null ? [] : [text(' en « '), subject(fact, label), text(' »')];
    if (lead === null || label === null || lead.name === label) {
      return byActor(
        fact,
        [
          text(`a renommé ${noun.a}`),
          ...to,
          ...(summary === null ? [] : [text(` : ${summary}`)]),
          ...motive(fact, null),
        ],
        actConsumed(summary),
      );
    }
    const tail = tailOf(lead, noun);
    return byActor(
      fact,
      [
        text(`a renommé ${noun.the} « `),
        name(lead.name),
        text(' »'),
        ...to,
        ...(tail === '' ? [] : [text(` : ${tail}`)]),
        ...motive(fact, lead.name),
      ],
      actConsumed(summary),
    );
  };
}

/**
 * Le sujet d'une limite est sa PORTÉE, déjà dite en mots par le domaine
 * (`describeScope`, lu le 2026-09-19) : « tout le catalogue », « famille
 * « Tartes » », « produit « Tarte citron » ». La charge ne dit pas de quelle
 * sorte de portée il s'agit ailleurs que dans ces mots : plutôt que d'en
 * déduire un article, la portée se dit entre parenthèses, telle quelle.
 */
function floorAct(verb: string): Phrase {
  return (fact) => {
    const label = subjectLabelOf(fact);
    const summary = optional(fact.payload['summary']);
    return byActor(
      fact,
      [
        text(`${verb} `),
        ...(label === null
          ? [text('une limite de prix')]
          : [text('la limite de prix (portée : '), subject(fact, label), text(')')]),
        ...(summary === null ? [] : [text(` : ${summary}`)]),
        ...motive(fact, null),
      ],
      actConsumed(summary),
    );
  };
}

export const PRICING_PHRASES = {
  'price_rule.posed': act('a posé', RULE),
  'price_rule.paused': act('a suspendu', RULE),
  'price_rule.resumed': act('a repris', RULE),
  'price_rule.archived': act('a archivé', RULE),
  'price_rule.renamed': renamed(RULE),
  'price_floor.posed': floorAct('a posé'),
  'price_floor.replaced': floorAct('a remplacé'),
  'price_floor.archived': floorAct('a archivé'),
  'price_floor.confirmed': floorAct('a confirmé'),
  'volume_ladder.posed': act('a posé', LADDER),
  'volume_ladder.paused': act('a suspendu', LADDER),
  'volume_ladder.resumed': act('a repris', LADDER),
  'volume_ladder.archived': act('a archivé', LADDER),
  'company_mercuriale.posed': act('a posé', MERCURIALE),
  'company_mercuriale.archived': act('a archivé', MERCURIALE),
  'company_mercuriale.renamed': renamed(MERCURIALE),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
