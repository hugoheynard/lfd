/** Petits utilitaires de lecture d'événements natifs, partagés par les panneaux. */

export function numberValue(event: Event): number | null {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.value.trim() === '') {
    return null;
  }
  const parsed = Number(target.value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function textValue(event: Event): string {
  return event.target instanceof HTMLTextAreaElement ? event.target.value : '';
}
