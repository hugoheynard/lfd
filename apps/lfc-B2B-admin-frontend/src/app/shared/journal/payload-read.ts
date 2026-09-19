/**
 * **Lire une charge du journal sans la croire.**
 *
 * Une charge est du JSON écrit par une autre version du code : une ligne de
 * 2026 peut ne pas avoir la forme d'aujourd'hui, et même une clé attendue peut
 * y manquer. Chaque phrase lit donc ses champs défensivement — un champ absent
 * disparaît de la phrase ou s'y dit « — », jamais un identifiant ni une erreur.
 */

/** Une charge, ou un objet imbriqué dans une charge. */
export type Payload = Readonly<Record<string, unknown>>;

/** Une chaîne non vide, ou `null`. Le vide n'est pas une valeur à afficher. */
export function optional(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** La chaîne, ou « — » : une phrase ne perd pas sa forme pour un champ manquant. */
export function text(value: unknown): string {
  return optional(value) ?? '—';
}

/** Un compte, ou `null` s'il n'a pas été figé. Zéro EST un compte. */
export function count(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

/** L'objet, ou `null` s'il n'en est pas un (tableau compris). */
export function recordOf(value: unknown): Payload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return { ...value };
}

/** Les objets d'une liste figée ; ce qui n'en est pas un est ignoré. */
export function entries(value: unknown): readonly Payload[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(recordOf).filter((entry): entry is Payload => entry !== null);
}

/** Les chaînes non vides d'une liste figée. */
export function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.map(optional).filter((item): item is string => item !== null)
    : [];
}

/**
 * Le nom lisible d'une valeur citée : une chaîne, un texte traduisible
 * (`{ fr, en?, it? }` — le français fait foi), ou un objet cité (`{ id, name }`).
 * `null` si rien de tout ça — jamais l'identifiant.
 */
export function nameOf(value: unknown): string | null {
  const direct = optional(value);
  if (direct !== null) {
    return direct;
  }
  const cited = recordOf(value);
  if (cited === null) {
    return null;
  }
  return optional(cited['fr']) ?? optional(cited['name']);
}
