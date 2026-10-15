/** Une date de dépôt, à l'heure de Paris : « 12/10/2026 à 09:30 ». */
const STAMP = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/** Une date seule, à l'heure de Paris : « 12/10/2026 ». */
const DAY = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

export function stampOf(iso: string): string {
  return STAMP.format(new Date(iso)).replace(' ', ' à ');
}

export function dayOf(iso: string): string {
  return DAY.format(new Date(iso));
}

/** Une taille de fichier lisible : « 245 Ko », « 1,2 Mo ». */
export function sizeOf(bytes: number): string {
  const KILO = 1024;
  if (bytes < KILO * KILO) {
    return `${Math.max(1, Math.round(bytes / KILO))} Ko`;
  }
  return `${(bytes / (KILO * KILO)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}
