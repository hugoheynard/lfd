import type { Payload } from './payload-read';
import { optional } from './payload-read';
import { subjectRoute } from './subject-routes';

/**
 * **Une phrase du journal, en segments** (D3 du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`).
 *
 * Une phrase ne rend pas une chaîne : elle rend des segments — du texte, un nom
 * en gras, une valeur mise en forme, le sujet (lié à sa fiche quand une route
 * existe). C'est ce qui permet le gras et le lien **sans `innerHTML`** : le
 * gabarit rend chaque segment par son propre élément.
 *
 * Et elle déclare les clés de la charge qu'elle a **dites** (`consumed`) : le
 * détail sous la phrase rend tout le reste (D4). Une clé ni dite ni rendue
 * serait perdue — c'est ce que le test de clôture interdit.
 */
export type Segment =
  | { readonly kind: 'text'; readonly text: string }
  /** Un nom, en gras : une personne, une famille, un taux. */
  | { readonly kind: 'name'; readonly text: string }
  /** Une valeur mise en forme : un montant, un taux, une heure. */
  | { readonly kind: 'value'; readonly text: string }
  /** Le sujet de la ligne, en gras — et un lien vers sa fiche quand `route` existe. */
  | { readonly kind: 'subject'; readonly text: string; readonly route: string | null };

/** Ce qu'une phrase reçoit d'un fait. */
export interface PhraseFact {
  readonly type: string;
  readonly payload: Payload;
  readonly subjectType: string;
  readonly subjectId: string;
  /**
   * L'auteur tel qu'une phrase à la voix active le nomme en tête : le nom figé
   * à l'acte (« Hugo Heynard »), sinon sa nature (« Un membre de l'équipe »).
   */
  readonly actor: string;
}

/** Ce qu'une phrase rend. */
export interface Said {
  /** Le geste, en titre au-dessus de la phrase (« Changement de rôle ») ; `null` s'il n'y en a pas. */
  readonly title: string | null;
  readonly segments: readonly Segment[];
  /** Les clés de la charge que la phrase a dites : le détail rend les autres. */
  readonly consumed: readonly string[];
  /** Vrai quand la phrase nomme déjà l'auteur : la ligne ne répète pas « par … ». */
  readonly namesActor: boolean;
}

/** Une phrase : un fait → ce qu'il dit. */
export type Phrase = (fact: PhraseFact) => Said;

export function text(value: string): Segment {
  return { kind: 'text', text: value };
}

export function name(value: string): Segment {
  return { kind: 'name', text: value };
}

export function value(formatted: string): Segment {
  return { kind: 'value', text: formatted };
}

/** Le sujet sous ce libellé, lié à sa fiche quand l'écran en a une. */
export function subject(fact: PhraseFact, label: string): Segment {
  return { kind: 'subject', text: label, route: subjectRoute(fact.subjectType, fact.subjectId) };
}

/** Le libellé du sujet figé à l'écriture (D6), ou `null` s'il n'en porte pas. */
export function subjectLabelOf(fact: PhraseFact): string | null {
  return optional(fact.payload['subjectLabel']);
}

/** Une phrase à la troisième personne, sans titre, qui ne nomme pas l'auteur. */
export function said(segments: readonly Segment[], consumed: readonly string[]): Said {
  return { title: null, segments, consumed, namesActor: false };
}

/** La phrase en texte suivi — pour la recherche, les tests, un lecteur d'écran. */
export function plain(segments: readonly Segment[]): string {
  return segments.map((segment) => segment.text).join('');
}

/** Qui agissait, dans la forme que le contrat sert. */
export type ActorType = 'staff' | 'customer' | 'system';

/**
 * L'auteur sans nom, dit par sa NATURE, en tête de phrase. Un `Record`
 * exhaustif : une nature ajoutée au contrat ne compile pas tant qu'elle n'a pas
 * sa tournure ici. Jamais le `sub` ni l'id de sa fiche, qui ne diraient rien à
 * celui qui lit.
 */
const UNNAMED_ACTORS: Readonly<Record<ActorType, string>> = {
  staff: 'Un membre de l’équipe',
  system: 'Le système',
  customer: 'Un client',
};

/** Les mêmes, après « par » : « …, par un membre de l'équipe ». */
const UNNAMED_AUTHORS: Readonly<Record<ActorType, string>> = {
  staff: 'un membre de l’équipe',
  system: 'le système',
  customer: 'un client',
};

/** L'auteur en sujet d'une phrase à la voix active. */
export function actorSubject(actorName: string | null, actorType: ActorType): string {
  return optional(actorName) ?? UNNAMED_ACTORS[actorType];
}

/**
 * L'auteur après « par ». La fonction entre parenthèses quand elle est connue :
 * « qui a fait ça, et à quel titre » est la question qu'on pose à un journal.
 */
export function actorBy(
  actorName: string | null,
  actorRole: string | null,
  actorType: ActorType,
): string {
  const name = optional(actorName);
  if (name === null) {
    return UNNAMED_AUTHORS[actorType];
  }
  const role = optional(actorRole);
  return role === null ? name : `${name} (${role})`;
}
