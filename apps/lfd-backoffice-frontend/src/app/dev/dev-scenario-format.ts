import type { DevScenarioPurgeCategory, DevScenarioResetReport } from '@lfd/contracts';

/**
 * « lundi 5 octobre », depuis `AAAA-MM-JJ`.
 *
 * Lu en UTC : la date du serveur est un jour civil, pas un instant, et la
 * lire dans le fuseau du poste la décalerait d'un jour à l'ouest de Greenwich.
 */
export function longDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return day;
  }
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
}

const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;

/** « 412 Mo », « 1,2 Go » — la taille de la base, lisible d'un coup d'œil. */
export function databaseSize(bytes: number): string {
  if (bytes >= GIGABYTE) {
    return `${(bytes / GIGABYTE).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;
  }
  return `${Math.round(bytes / MEGABYTE).toLocaleString('fr-FR')} Mo`;
}

/**
 * Les catégories du compte rendu, en mots de l'équipe : pas de nom de table,
 * ni de mécanisme interne (§3.4).
 */
const PURGE_LABELS: Readonly<Record<DevScenarioPurgeCategory, string>> = {
  orders: 'Commandes et leurs lignes',
  production: 'Fournil',
  packing: 'Colisage',
  delivery: 'Bacs et tournées',
  outbox: 'Messages échangés entre les services',
  journals: 'Historiques et journaux d’activité',
};

export interface PurgeLine {
  readonly label: string;
  readonly count: string;
}

/** Ce qui est parti, catégorie par catégorie — les fichiers comptés à part. */
export function purgeLines(report: DevScenarioResetReport): readonly PurgeLine[] {
  const lines: PurgeLine[] = report.removed.map((entry) => ({
    label: PURGE_LABELS[entry.category],
    count: plural(entry.rows, 'élément', 'éléments'),
  }));
  const files = report.storage.reduce((total, bucket) => total + bucket.objects, 0);
  lines.push({
    label: 'Fichiers (bons de commande, photos)',
    count: plural(files, 'fichier', 'fichiers'),
  });
  return lines;
}

function plural(value: number, singular: string, many: string): string {
  return `${value.toLocaleString('fr-FR')} ${value === 1 ? singular : many}`;
}
