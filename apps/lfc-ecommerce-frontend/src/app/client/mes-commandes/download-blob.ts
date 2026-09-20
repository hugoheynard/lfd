/**
 * Propose un fichier **reçu du serveur** au téléchargement.
 *
 * Isolé ici pour la raison qui isolait déjà `downloadText` côté hérité : c'est
 * la seule partie qui touche au DOM, et un service qui la porterait ne serait
 * plus testable sans navigateur.
 *
 * ⚠️ Proche cousin de `legacy/commandes/download-text.ts`, et volontairement
 * **pas** le même : celui-là fabrique le contenu dans le navigateur, celui-ci
 * transporte des octets que le serveur a produits et archivés. Les fusionner
 * ferait passer pour un détail de plomberie une différence qui est tout le
 * sujet — l'un refabrique à chaque fois, l'autre rend toujours le même fichier.
 *
 * L'URL objet est révoquée après coup : sans ça, chaque téléchargement fuiterait
 * son blob jusqu'au rechargement de la page.
 */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
