/** Petits utilitaires de lecture d'événements natifs, partagés par les panneaux. */

export function numberValue(event: Event): number | null {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.value.trim() === '') {
    return null;
  }
  const parsed = Number(target.value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Le texte d'une zone de texte ou d'un champ (le prix pro HT se saisit en texte, lot P). */
export function textValue(event: Event): string {
  const target = event.target;
  return target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
    ? target.value
    : '';
}
