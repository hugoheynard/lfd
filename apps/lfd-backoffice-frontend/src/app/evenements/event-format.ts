import { EVENT_FUNCTION_SHEET_MAX_BYTES } from '@lfd/contracts';

/** Le nom des applications qu'un événement concerne. */
const APPLICATION_LABELS: Readonly<Record<string, string>> = {
  lafoliecoffee: 'La Folie Coffee',
};

/** Les applications, nommées ; une valeur inconnue s'affiche telle quelle. */
export function applicationsLabel(applications: readonly string[]): string {
  return applications
    .map((application) => APPLICATION_LABELS[application] ?? application)
    .join(', ');
}

/** `AAAA-MM-JJ` → « samedi 12 décembre 2026 ». Un jour du calendrier, sans fuseau. */
export function eventDayLabel(day: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** ISO 8601 → « 24/11/2026 14:05 », à l'heure de Paris. */
export function stampLabel(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));
}

const BYTES_PER_KB = 1024;

/** Une taille lisible : « 312 Ko », « 4,2 Mo ». */
export function sizeLabel(bytes: number): string {
  const kb = bytes / BYTES_PER_KB;
  if (kb < BYTES_PER_KB) {
    return `${Math.max(1, Math.round(kb))} Ko`;
  }
  return `${(kb / BYTES_PER_KB).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

const PDF_TYPE = 'application/pdf';
const PDF_EXTENSION = /\.pdf$/iu;

/**
 * Le refus de l'écran avant l'envoi, ou `null` si la fiche peut partir. Le
 * serveur juge en dernier (il lit l'en-tête du fichier) ; l'écran évite
 * seulement d'envoyer 20 Mo pour se les voir refuser.
 */
export function sheetRefusal(file: File): string | null {
  const isPdf = file.type === PDF_TYPE || (file.type === '' && PDF_EXTENSION.test(file.name));
  if (!isPdf) {
    return 'Seul un PDF est accepté : exportez la fiche en PDF depuis Excel, puis déposez-la.';
  }
  if (file.size > EVENT_FUNCTION_SHEET_MAX_BYTES) {
    return `La fiche dépasse ${sizeLabel(EVENT_FUNCTION_SHEET_MAX_BYTES)} : allégez le PDF avant de le déposer.`;
  }
  return null;
}
