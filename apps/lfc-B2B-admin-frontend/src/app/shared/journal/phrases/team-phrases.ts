import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  entries,
  optional,
  recordOf,
  strings,
  text as orDash,
  type Payload,
} from '../payload-read';
import { name, text, type Phrase, type PhraseFact, type Said, type Segment } from '../phrase';

/**
 * **Les faits de l'équipe**, tels qu'un humain les lit : le geste en titre, puis
 * une phrase à la voix active qui nomme l'auteur et la personne visée.
 *
 * Repris tels quels de `admin/journal/staff-line.ts` (plan des phrases, lot C,
 * 2026-09-19) : mêmes mots, mêmes replis, en segments désormais — la personne
 * et le rôle en gras.
 *
 * Tout ce que la phrase affiche vient de la charge, **figée** au moment de
 * l'acte (plan « journal de l'annuaire », §5 bis) : une fiche renommée ou un
 * rôle modifié depuis ne change pas la phrase d'hier. Rien n'est relu dans
 * l'annuaire, et un champ absent rend `—` ou disparaît — jamais un identifiant.
 */

/** Une phrase de l'équipe : titre, segments, et les clés qu'elle a dites. */
function staff(title: string, segments: readonly Segment[], consumed: readonly string[]): Said {
  return { title, segments, consumed: ['subjectLabel', ...consumed], namesActor: true };
}

/**
 * « (reprise) » au bout d'une phrase **reconstituée** après coup (plan « reprise
 * du journal de l'annuaire », D1) : une trace attestée ne doit pas se lire
 * comme une trace vécue. Seul `true` marque — un champ mal formé n'invente pas
 * une reprise.
 */
function backfilled(fact: PhraseFact, line: Said): Said {
  const mark = fact.payload['backfilled'] === true ? [text(' (reprise)')] : [];
  return {
    ...line,
    segments: [...line.segments, ...mark],
    consumed: [...line.consumed, 'backfilled'],
  };
}

/** « Cécile Martin ». Un prénom seul reste un nom ; rien du tout rend `—`. */
function personOf(value: unknown): string {
  const person = recordOf(value);
  if (person === null) {
    return '—';
  }
  const parts = [optional(person['firstName']), optional(person['lastName'])].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? '—' : parts.join(' ');
}

/** `before + valeur + after`, ou rien si la valeur n'a pas été figée. */
function suffix(before: string, value: unknown, after: string): Segment[] {
  const said = optional(value);
  return said === null ? [] : [text(before), name(said), text(after)];
}

/** Une phrase simple sur une personne : « <auteur> <verbe> <personne><fin> ». */
function onPerson(title: string, verb: string, end = ''): Phrase {
  return (fact) =>
    staff(
      title,
      [text(`${fact.actor} ${verb}`), name(personOf(fact.payload['person'])), text(end)],
      ['person'],
    );
}

export const TEAM_PHRASES = {
  'staff_user.created': (fact) =>
    backfilled(
      fact,
      staff(
        'Création d’un membre de l’équipe',
        [
          text(`${fact.actor} a créé `),
          name(personOf(fact.payload['person'])),
          ...suffix(', ', fact.payload['roleLabel'], ''),
        ],
        ['person', 'roleLabel'],
      ),
    ),
  'staff_user.invited': (fact) => {
    const person = name(personOf(fact.payload['person']));
    const line =
      fact.payload['kind'] === 'password_reset'
        ? staff(
            'Nouveau mot de passe',
            [
              text(`${fact.actor} a envoyé à `),
              person,
              text(' un lien pour choisir un nouveau mot de passe'),
            ],
            ['person', 'kind'],
          )
        : staff(
            'Invitation',
            [text(`${fact.actor} a invité `), person, text(' à rejoindre le back-office')],
            ['person', 'kind'],
          );
    return backfilled(fact, line);
  },
  'staff_user.password_link_issued': onPerson(
    'Lien remis à la main',
    'a fabriqué un lien d’accès pour ',
    ', à lui remettre en personne',
  ),
  'staff_user.identity_edited': (fact) =>
    staff('Fiche modifiée', identitySegments(fact), ['person', 'previous', 'fields', 'changes']),
  'staff_user.role_changed': (fact) =>
    staff(
      'Changement de rôle',
      [
        text(`${fact.actor} a fait passer `),
        name(personOf(fact.payload['person'])),
        text(' de '),
        name(orDash(fact.payload['fromLabel'])),
        text(' à '),
        name(orDash(fact.payload['toLabel'])),
      ],
      ['person', 'fromLabel', 'toLabel'],
    ),
  'staff_user.overrides_changed': (fact) =>
    staff('Droits individuels', overridesSegments(fact), ['person', 'added', 'removed', 'changed']),
  'staff_user.suspended': onPerson('Accès suspendu', 'a suspendu l’accès de '),
  'staff_user.activated': onPerson('Accès activé', 'a activé l’accès de '),
  // Jusqu'au 2026-09-19, ce type couvrait AUSSI la première activation d'une
  // fiche en attente (D7 du plan des phrases) : la phrase dit ce qui est vrai
  // des deux, puisque les lignes anciennes ne se réécrivent pas.
  'staff_user.reinstated': onPerson('Accès activé ou rétabli', 'a activé ou rétabli l’accès de '),
  'staff_user.deleted': (fact) =>
    staff(
      'Suppression d’un membre',
      [
        text(`${fact.actor} a supprimé la fiche de `),
        name(personOf(fact.payload['person'])),
        ...suffix(' (', fact.payload['roleLabel'], ')'),
      ],
      ['person', 'roleLabel'],
    ),

  'staff_role.created': (fact) =>
    staff(
      'Nouveau rôle',
      [text(`${fact.actor} a créé le rôle `), name(orDash(fact.payload['label']))],
      ['label'],
    ),
  'staff_role.updated': (fact) =>
    staff('Rôle modifié', roleUpdateSegments(fact), [
      'label',
      'previousLabel',
      'added',
      'removed',
      'changed',
    ]),
  'staff_role.archived': (fact) =>
    staff(
      'Rôle archivé',
      [text(`${fact.actor} a archivé le rôle `), name(orDash(fact.payload['label']))],
      ['label'],
    ),
  'staff_role.restored': (fact) =>
    staff(
      'Rôle restauré',
      [text(`${fact.actor} a restauré le rôle `), name(orDash(fact.payload['label']))],
      ['label'],
    ),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;

/**
 * « … a modifié la fiche de Cécile Martin : téléphone 06 11 22 33 44 → 07 55 66
 * 77 88 ; fonction (vide) → Vendeuse ».
 *
 * `changes` porte l'avant/après de chaque champ ; les faits écrits avant lui
 * n'ont que `fields` (les libellés) et `previous` (l'ancien nom, figé seulement
 * s'il a changé) — ils se lisent comme avant. Avec `changes`, l'ancien nom est
 * déjà dans l'avant/après : le rappeler en plus le dirait deux fois.
 */
function identitySegments(fact: PhraseFact): Segment[] {
  const p = fact.payload;
  const head = [text(`${fact.actor} a modifié la fiche de `), name(personOf(p['person']))];
  const changes = entries(p['changes'])
    .map(changeOf)
    .filter((change): change is string => change !== null);
  if (changes.length > 0) {
    return [...head, text(` : ${changes.join(' ; ')}`)];
  }
  const previous = recordOf(p['previous']) === null ? null : personOf(p['previous']);
  const formerly = previous === null || previous === '—' ? '' : ` (anciennement ${previous})`;
  const fields = strings(p['fields']);
  const which = fields.length === 0 ? '' : ` : ${fields.join(', ')}`;
  return [...head, text(`${formerly}${which}`)];
}

/**
 * « téléphone 06 11 22 33 44 → 07 55 66 77 88 ». Sans libellé figé, l'entrée
 * est tue : la clé du champ n'est pas un mot pour celui qui lit.
 */
function changeOf(change: Payload): string | null {
  const label = optional(change['label']);
  return label === null ? null : `${label} ${valueOf(change['from'])} → ${valueOf(change['to'])}`;
}

/** Une valeur vide se dit, sinon « fonction  → Vendeuse » se lirait comme une coquille. */
function valueOf(value: unknown): string {
  return optional(value) ?? '(vide)';
}

/**
 * « … a changé les droits individuels de Cécile Martin — accordé : Tarification
 * (écriture) — refusé : Prospects (lecture) — rendu au rôle : Alertes (lecture) ».
 *
 * Une dérogation **retirée** ne refuse rien : elle rend la ressource à ce que
 * le rôle décide. Une dérogation **modifiée** porte son nouvel effet, et se
 * range donc avec les ajouts du même effet.
 */
function overridesSegments(fact: PhraseFact): Segment[] {
  const p = fact.payload;
  const current = [...entries(p['added']), ...entries(p['changed'])];
  const parts = [
    group(
      'accordé',
      current.filter((o) => o['effect'] === 'allow'),
    ),
    group(
      'refusé',
      current.filter((o) => o['effect'] === 'deny'),
    ),
    group('rendu au rôle', entries(p['removed'])),
  ].filter((part) => part !== '');
  return [
    text(`${fact.actor} a changé les droits individuels de `),
    name(personOf(p['person'])),
    text(parts.length === 0 ? '' : ` — ${parts.join(' — ')}`),
  ];
}

/**
 * « … a modifié le rôle Commercial : + Alertes (écriture), − Prospects
 * (lecture), Tarification → écriture ». Un renommage se dit d'abord : c'est le
 * nom d'aujourd'hui qu'on cherche dans l'annuaire.
 */
function roleUpdateSegments(fact: PhraseFact): Segment[] {
  const p = fact.payload;
  const role = orDash(p['label']);
  const previous = optional(p['previousLabel']);
  const formerly = previous === null || previous === role ? '' : ` (anciennement ${previous})`;
  const changes = [
    ...entries(p['added']).map((g) => `+ ${grantOf(g)}`),
    ...entries(p['removed']).map((g) => `− ${grantOf(g)}`),
    ...entries(p['changed']).map((g) => `${orDash(g['resourceLabel'])} → ${actionOf(g) ?? '—'}`),
  ];
  const which = changes.length === 0 ? '' : ` : ${changes.join(', ')}`;
  return [text(`${fact.actor} a modifié le rôle `), name(role), text(`${formerly}${which}`)];
}

/** « Tarification (écriture) » — l'action tue si elle n'a pas été figée. */
function grantOf(grant: Payload): string {
  const action = actionOf(grant);
  return `${orDash(grant['resourceLabel'])}${action === null ? '' : ` (${action})`}`;
}

const ACTION_LABELS: Readonly<Record<string, string>> = { read: 'lecture', write: 'écriture' };

function actionOf(grant: Payload): string | null {
  const action = grant['action'];
  return typeof action === 'string' ? (ACTION_LABELS[action] ?? null) : null;
}

function group(verb: string, grants: readonly Payload[]): string {
  return grants.length === 0 ? '' : `${verb} : ${grants.map(grantOf).join(', ')}`;
}
