import type { ActivityEventView } from '@lfd/contracts';

/**
 * Un fait de l'**équipe**, tel qu'un humain le lit : le geste en titre, puis une
 * phrase à la voix active qui nomme l'auteur et la personne visée.
 *
 * Tout ce que la phrase affiche vient de la charge utile, **figée** au moment
 * de l'acte (plan « journal de l'annuaire », §5 bis) : une fiche supprimée ou
 * un rôle renommé depuis ne change pas la phrase d'hier. Rien n'est relu dans
 * l'annuaire, et rien n'est traduit depuis une clé.
 *
 * La charge utile est du JSON non typé : chaque champ se lit défensivement, et
 * un champ absent rend `—` ou disparaît de la phrase — jamais un identifiant.
 */
export interface StaffLine {
  /** « Création d'un membre de l'équipe » — le geste. */
  readonly title: string;
  /** « Hugo Heynard a créé Cécile Martin, Commercial » — l'auteur y est nommé. */
  readonly sentence: string;
}

type Payload = ActivityEventView['payload'];

/** Le fait de l'équipe mis en phrase, ou `null` si ce n'en est pas un connu. */
export function staffLineOf(event: ActivityEventView): StaffLine | null {
  const p = event.payload;
  const who = actorOf(event);
  const line = userLine(event.type, who, p) ?? roleLine(event.type, who, p);
  return line === null ? null : { ...line, sentence: `${line.sentence}${backfillMark(p)}` };
}

/**
 * « (reprise) » au bout d'une phrase **reconstituée** après coup (plan « reprise
 * du journal de l'annuaire », D1) : une trace attestée ne doit pas se lire
 * comme une trace vécue. Seul `true` marque — un champ mal formé n'invente pas
 * une reprise.
 */
function backfillMark(p: Payload): string {
  return p['backfilled'] === true ? ' (reprise)' : '';
}

function userLine(type: string, who: string, p: Payload): StaffLine | null {
  const person = personOf(p['person']);
  switch (type) {
    case 'staff_user.created':
      return {
        title: 'Création d’un membre de l’équipe',
        sentence: `${who} a créé ${person}${suffix(', ', p['roleLabel'], '')}`,
      };
    case 'staff_user.invited':
      return p['kind'] === 'password_reset'
        ? {
            title: 'Nouveau mot de passe',
            sentence: `${who} a envoyé à ${person} un lien pour choisir un nouveau mot de passe`,
          }
        : {
            title: 'Invitation',
            sentence: `${who} a invité ${person} à rejoindre le back-office`,
          };
    case 'staff_user.password_link_issued':
      return {
        title: 'Lien remis à la main',
        sentence: `${who} a fabriqué un lien d’accès pour ${person}, à lui remettre en personne`,
      };
    case 'staff_user.identity_edited':
      return { title: 'Fiche modifiée', sentence: identitySentence(who, person, p) };
    case 'staff_user.role_changed':
      return {
        title: 'Changement de rôle',
        sentence: `${who} a fait passer ${person} de ${text(p['fromLabel'])} à ${text(p['toLabel'])}`,
      };
    case 'staff_user.overrides_changed':
      return { title: 'Droits individuels', sentence: overridesSentence(who, person, p) };
    case 'staff_user.suspended':
      return { title: 'Accès suspendu', sentence: `${who} a suspendu l’accès de ${person}` };
    case 'staff_user.reinstated':
      return { title: 'Accès rétabli', sentence: `${who} a rétabli l’accès de ${person}` };
    case 'staff_user.deleted':
      return {
        title: 'Suppression d’un membre',
        sentence: `${who} a supprimé la fiche de ${person}${suffix(' (', p['roleLabel'], ')')}`,
      };
    default:
      return null;
  }
}

function roleLine(type: string, who: string, p: Payload): StaffLine | null {
  const role = text(p['label']);
  switch (type) {
    case 'staff_role.created':
      return { title: 'Nouveau rôle', sentence: `${who} a créé le rôle ${role}` };
    case 'staff_role.updated':
      return { title: 'Rôle modifié', sentence: roleUpdateSentence(who, role, p) };
    case 'staff_role.archived':
      return { title: 'Rôle archivé', sentence: `${who} a archivé le rôle ${role}` };
    case 'staff_role.restored':
      return { title: 'Rôle restauré', sentence: `${who} a restauré le rôle ${role}` };
    default:
      return null;
  }
}

/**
 * L'auteur sans nom, dit par sa NATURE. Un `Record` exhaustif : une nature
 * ajoutée au contrat ne compile pas tant qu'elle n'a pas sa tournure ici.
 * Avant ce repli, tout auteur sans nom devenait « Un membre de l'équipe »,
 * y compris le système qui a créé l'admin racine (plan « reprise », D5).
 */
const UNNAMED_ACTORS: Readonly<Record<ActivityEventView['actorType'], string>> = {
  staff: 'Un membre de l’équipe',
  system: 'Le système',
  customer: 'Un client',
};

/**
 * L'auteur, tel que l'adaptateur l'a figé. S'il manque, sa NATURE — jamais le
 * `sub` ni l'id de sa fiche, qui ne diraient rien à celui qui lit.
 */
function actorOf(event: ActivityEventView): string {
  return optional(event.actorName) ?? UNNAMED_ACTORS[event.actorType];
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

/**
 * « … a modifié la fiche de Cécile Martin : téléphone 06 11 22 33 44 → 07 55 66
 * 77 88 ; fonction (vide) → Vendeuse ».
 *
 * `changes` porte l'avant/après de chaque champ ; les faits écrits avant lui
 * n'ont que `fields` (les libellés) et `previous` (l'ancien nom, figé seulement
 * s'il a changé) — ils se lisent comme avant. Avec `changes`, l'ancien nom est
 * déjà dans l'avant/après : le rappeler en plus le dirait deux fois.
 */
function identitySentence(who: string, person: string, p: Payload): string {
  const changes = entries(p['changes'])
    .map(changeOf)
    .filter((c): c is string => c !== null);
  if (changes.length > 0) {
    return `${who} a modifié la fiche de ${person} : ${changes.join(' ; ')}`;
  }
  const previous = recordOf(p['previous']) === null ? null : personOf(p['previous']);
  const formerly = previous === null || previous === '—' ? '' : ` (anciennement ${previous})`;
  const fields = strings(p['fields']);
  const which = fields.length === 0 ? '' : ` : ${fields.join(', ')}`;
  return `${who} a modifié la fiche de ${person}${formerly}${which}`;
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
function overridesSentence(who: string, person: string, p: Payload): string {
  const current = [...entries(p['added']), ...entries(p['changed'])];
  const allowed = current.filter((o) => o['effect'] === 'allow');
  const denied = current.filter((o) => o['effect'] === 'deny');
  const parts = [
    group('accordé', allowed),
    group('refusé', denied),
    group('rendu au rôle', entries(p['removed'])),
  ].filter((part) => part !== '');
  return `${who} a changé les droits individuels de ${person}${dashed(parts)}`;
}

/**
 * « … a modifié le rôle Commercial : + Alertes (écriture), − Prospects
 * (lecture), Tarification → écriture ». Un renommage se dit d'abord : c'est le
 * nom d'aujourd'hui qu'on cherche dans l'annuaire.
 */
function roleUpdateSentence(who: string, role: string, p: Payload): string {
  const previous = optional(p['previousLabel']);
  const formerly = previous === null || previous === role ? '' : ` (anciennement ${previous})`;
  const changes = [
    ...entries(p['added']).map((g) => `+ ${grantOf(g)}`),
    ...entries(p['removed']).map((g) => `− ${grantOf(g)}`),
    ...entries(p['changed']).map((g) => `${text(g['resourceLabel'])} → ${actionOf(g) ?? '—'}`),
  ];
  const which = changes.length === 0 ? '' : ` : ${changes.join(', ')}`;
  return `${who} a modifié le rôle ${role}${formerly}${which}`;
}

/** « Tarification (écriture) » — l'action tue si elle n'a pas été figée. */
function grantOf(grant: Payload): string {
  const action = actionOf(grant);
  return `${text(grant['resourceLabel'])}${action === null ? '' : ` (${action})`}`;
}

const ACTION_LABELS: Readonly<Record<string, string>> = { read: 'lecture', write: 'écriture' };

function actionOf(grant: Payload): string | null {
  const action = grant['action'];
  return typeof action === 'string' ? (ACTION_LABELS[action] ?? null) : null;
}

function group(verb: string, grants: readonly Payload[]): string {
  return grants.length === 0 ? '' : `${verb} : ${grants.map(grantOf).join(', ')}`;
}

function dashed(parts: readonly string[]): string {
  return parts.length === 0 ? '' : ` — ${parts.join(' — ')}`;
}

/** Les objets d'une liste figée ; ce qui n'en est pas un est ignoré. */
function entries(value: unknown): readonly Payload[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(recordOf).filter((entry): entry is Payload => entry !== null);
}

function recordOf(value: unknown): Payload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return { ...value };
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.map(optional).filter((item): item is string => item !== null)
    : [];
}

/** `before + valeur + after`, ou rien si la valeur n'a pas été figée. */
function suffix(before: string, value: unknown, after: string): string {
  const said = optional(value);
  return said === null ? '' : `${before}${said}${after}`;
}

function text(value: unknown): string {
  return optional(value) ?? '—';
}

function optional(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
