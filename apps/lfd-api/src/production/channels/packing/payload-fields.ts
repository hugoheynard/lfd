/**
 * **Relire un champ de charge utile**, côté abonné — sans jamais inventer de
 * valeur. Chaque lecteur rend `null` quand le champ est hors forme ; c'est
 * l'appelant (`fromPayload`) qui lève l'erreur propre à son fait.
 *
 * Partagés par les trois faits du canal : trois copies des mêmes gardes
 * auraient divergé à la première correction.
 */

/** Une chaîne non vide, ou `null`. */
export function textOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Un entier strictement positif — une quantité de pièces —, ou `null`. */
export function piecesOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/** Un instant ISO lisible, ou `null`. */
export function instantOf(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Un objet clé → valeur (pas un tableau), ou `null`. */
export function recordOf(value: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return Object.fromEntries(Object.entries(value));
}
