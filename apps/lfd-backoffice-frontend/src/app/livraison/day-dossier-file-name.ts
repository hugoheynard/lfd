/** Les mois, en toutes lettres et sans accent : un nom de fichier n'en porte pas. */
const MONTHS = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre',
] as const;

/**
 * Le nom du dossier des tournées d'un jour (décision de Hugo, 2026-10-26) —
 * `dossier-de-livraison-du-26-octobre-2026.pdf`. `day` est le jour de
 * service `AAAA-MM-JJ`, déjà un jour de Paris : aucun fuseau ici. Le serveur
 * nomme le même fichier (`dayRoundsDossierFileName`, `lfd-api`) ; le lien de
 * repli d'un onglet bloqué le reprend.
 */
export function dayDossierFileName(day: string): string {
  const [year = '', month = '', date = ''] = day.split('-');
  const monthName = MONTHS[Number(month) - 1] ?? month;
  return `dossier-de-livraison-du-${String(Number(date))}-${monthName}-${year}.pdf`;
}
