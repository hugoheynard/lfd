import type { ActivationBlocker, CounterOpenedAccountRow } from '@lfd/contracts';

/**
 * Le nom court de chaque empêchement, pour une cellule de table. Les phrases
 * longues de la fiche (`activation-steps.ts`) expliquent quoi faire ; ici on
 * ne fait que nommer ce qui manque.
 */
const BLOCKER_LABELS: Readonly<Record<ActivationBlocker, string>> = {
  identite_legale: 'Raison sociale et SIRET',
  detenteur: 'Détenteur',
  telephone: 'Téléphone',
  vat: 'N° de TVA',
  facturation: 'Adresse de facturation',
  chorus: 'Fiche Chorus Pro',
};

const OPENED_AT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeZone: 'Europe/Paris',
});

/** « Raison sociale et SIRET, Adresse de facturation », ou « Rien » si le compte est complet. */
export function missingLabel(row: CounterOpenedAccountRow): string {
  return row.missing.length === 0
    ? 'Rien'
    : row.missing.map((blocker) => BLOCKER_LABELS[blocker]).join(', ');
}

/** « Pièce vue par X », ou « Pièce non vue » — case décochée ou aucune trace. */
export function identityLabel(row: CounterOpenedAccountRow): string {
  const check = row.identityCheck;
  if (check === null || !check.seen) {
    return 'Pièce non vue';
  }
  return check.byName === null ? 'Pièce vue (agent non nommé)' : `Pièce vue par ${check.byName}`;
}

/** « Le 28 nov. 2026, par X ». */
export function openedLabel(row: CounterOpenedAccountRow): string {
  const when = `Le ${OPENED_AT.format(new Date(row.openedAt))}`;
  return row.openedByName === null ? when : `${when}, par ${row.openedByName}`;
}

/** Le libellé du geste : « Activer » quand rien ne manque, « Convertir » sinon. */
export function convertLabel(row: CounterOpenedAccountRow): string {
  return row.convertsToActive ? 'Activer' : 'Convertir';
}

/** La question posée avant le geste. */
export function convertQuestion(row: CounterOpenedAccountRow): string {
  return row.convertsToActive
    ? `Activer le compte « ${row.enseigne} » ?`
    : `Convertir le compte « ${row.enseigne} » ? Il passera en attente de validation.`;
}

/** Ce que l'écran dit après la conversion. */
export function convertedMessage(enseigne: string, status: 'pending' | 'active'): string {
  return status === 'active'
    ? `Le compte « ${enseigne} » est activé.`
    : `Le compte « ${enseigne} » est converti : il attend sa validation.`;
}
