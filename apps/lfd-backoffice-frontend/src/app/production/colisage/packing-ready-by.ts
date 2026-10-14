import type { PackingSheet } from '@lfd/contracts';

/** D'où vient l'heure, dit à la suite. */
const SOURCE_WORDS: Readonly<Record<NonNullable<PackingSheet['readyBySource']>, string>> = {
  round: 'départ de la tournée',
  transfer: 'départ du transfert',
  due: 'créneau du retrait',
};

/**
 * **L'heure « prête pour » d'une commande du poste, en toutes lettres** (lot
 * L2, `commandes/plan-tri-depart-et-couleurs.md` §3 ; Hugo, 2026-10-14).
 *
 * L'heure et sa source viennent du serveur (`readyBy`, `readyBySource`) :
 * l'écran ne les calcule pas, il dit d'où elles viennent — une livraison part
 * avec sa tournée, un retrait du village avec son transfert, un retrait sur
 * place à son créneau moins la mise en place au comptoir.
 *
 * `null` : la fiche ne porte pas l'heure (construite avant L2) — rien n'est
 * affiché plutôt qu'une heure devinée.
 */
export function readyByLabel(
  sheet: Pick<PackingSheet, 'fulfillmentMethod' | 'readyBy' | 'readyBySource'>,
): string | null {
  if (sheet.readyBy === undefined) {
    return null;
  }
  if (sheet.readyBy === null) {
    return sheet.fulfillmentMethod === 'delivery' ? 'Pas encore de départ' : 'Sans heure';
  }
  const time = sheet.readyBy.replace(':', ' h ');
  const source = sheet.readyBySource ?? 'due';
  return `Prête pour ${time} · ${SOURCE_WORDS[source]}`;
}
