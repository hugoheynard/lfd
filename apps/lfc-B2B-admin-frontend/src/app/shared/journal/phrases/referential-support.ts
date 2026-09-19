import { nameOf, optional, recordOf, type Payload } from '../payload-read';
import {
  byActor,
  changedKeys,
  inUnit,
  NO_CHANGE,
  subject,
  subjectLabelOf,
  text,
  whatChanged,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';
import type { JournalUnit } from '@lfd/contracts/journal-facts';

/**
 * **Les briques des phrases du référentiel** — partagées par
 * `referential-phrases.ts` et `referential-settings-phrases.ts` (plan des
 * phrases du journal, lot D, 2026-09-19), et par eux seuls : ce qui servirait
 * à toutes les familles irait dans `phrase.ts`.
 */

/**
 * Le sujet de la ligne, avec son article : « la famille « Tartes » » (en gras,
 * lié à sa fiche). Sans libellé figé (une ligne d'avant le lot B), le nom que
 * la charge porte ailleurs (`fallback`) ; sans rien, « une famille ».
 */
export function theSubject(
  fact: PhraseFact,
  noun: Noun,
  fallback: string | null = null,
): Segment[] {
  const label = subjectLabelOf(fact) ?? fallback;
  if (label === null) {
    return [text(noun.a)];
  }
  return [text(noun.the === '' ? '« ' : `${noun.the} « `), subject(fact, label), text(' »')];
}

/**
 * Un texte traduisible dont la phrase a TOUT dit en disant son français : il
 * ne porte ni anglais, ni italien. Sinon la phrase ne le consomme pas, et le
 * détail rend la traduction — « rien ne se perd » vaut aussi pour elle.
 */
export function untranslated(localized: unknown): boolean {
  const record = recordOf(localized);
  if (record === null) {
    return typeof localized === 'string';
  }
  return optional(record['en']) === null && optional(record['it']) === null;
}

/** `[key]` si le texte traduisible sous cette clé est tout entier dit par son français. */
export function saidName(payload: Payload, key: string): string[] {
  return payload[key] !== undefined && untranslated(payload[key]) ? [key] : [];
}

/** « (TAR-001) » à côté du nom — jamais à sa place. Rien si la ligne n'en porte pas. */
export function skuAside(raw: unknown): Segment[] {
  const sku = optional(raw);
  return sku === null ? [] : [text(` (${sku})`)];
}

/**
 * « (aucun changement) » quand le diff est vide, rien sinon : la phrase a nommé
 * la section, le détail dit ce qui y a bougé.
 */
export function unchanged(changes: unknown): Segment[] {
  return changedKeys(changes).length === 0 ? [text(` (${NO_CHANGE})`)] : [];
}

/** « A, B et C » — des groupes de segments joints comme on les dit. */
export function joined(parts: readonly (readonly Segment[])[]): Segment[] {
  return parts.flatMap((part, index) => {
    if (index === 0) {
      return [...part];
    }
    return [text(index === parts.length - 1 ? ' et ' : ', '), ...part];
  });
}

/**
 * Un avant → après chiffré, dit comme un humain le dit : « prix TTC de 12,00 €
 * à 13,50 € », « poids fixé à 450 g » (rien avant), « poids retiré (il était
 * de 450 g) » (rien après). `null` si la charge ne porte pas de changement.
 */
export function shift(label: string, unit: JournalUnit, raw: unknown): Segment[] | null {
  const change = recordOf(raw);
  if (change === null) {
    return null;
  }
  const from = change['from'];
  const to = change['to'];
  if (from === null || from === undefined) {
    return [text(`${label} fixé à `), inUnit(unit, to)];
  }
  if (to === null || to === undefined) {
    return [text(`${label} retiré (il était de `), inUnit(unit, from), text(')')];
  }
  return [text(`${label} de `), inUnit(unit, from), text(' à '), inUnit(unit, to)];
}

/**
 * « a <verbe> l'ingrédient « Beurre » ». Sans libellé figé, le nom que la
 * charge porte sous `nameKey` (un texte traduisible, ou une chaîne) ; il est
 * consommé quand la phrase l'a dit en entier.
 */
export function onSubject(verb: string, noun: Noun, nameKey: string | null = null): Phrase {
  return (fact) => {
    const fallback = nameKey === null ? null : nameOf(fact.payload[nameKey]);
    return byActor(
      fact,
      [text(`${verb} `), ...theSubject(fact, noun, fallback)],
      ['subjectLabel', ...(nameKey === null ? [] : saidName(fact.payload, nameKey))],
    );
  };
}

/** « a modifié l'appellation « Comté » : libellé, régime ». Le détail dit les valeurs. */
export function onSubjectChanges(noun: Noun): Phrase {
  return (fact) =>
    byActor(
      fact,
      [text('a modifié '), ...theSubject(fact, noun), ...whatChanged(fact.payload['changes'])],
      ['subjectLabel'],
    );
}
