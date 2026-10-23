/**
 * **Un lot partirait-il tel quel ?** Une ligne au moins, et aucune société
 * sans mandat (Q2, Hugo 2026-10-05).
 *
 * La SEULE écriture de la règle : l'agrégat la lit pour refuser le dépôt, le
 * rendu du fichier pour poser le bandeau de brouillon, et les lecteurs pour
 * l'écran et le téléchargement — quatre copies jusqu'au 2026-10-23, qu'un
 * troisième critère aurait fait diverger.
 */
export function isBatchDepositable(
  lineCount: number,
  unmandatedCompanies: readonly string[],
): boolean {
  return lineCount > 0 && unmandatedCompanies.length === 0;
}
