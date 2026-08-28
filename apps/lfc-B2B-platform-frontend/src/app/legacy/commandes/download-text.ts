/**
 * Télécharge un fichier texte fabriqué **dans le navigateur** (bon de livraison,
 * bon de commande). Isolé ici parce que c'est la seule partie qui touche au DOM :
 * le contenu, lui, est rendu par des fonctions pures et testables.
 *
 * L'URL objet est révoquée après coup — sans ça, chaque téléchargement fuiterait
 * son blob jusqu'au rechargement de la page.
 */
export function downloadText(fileName: string, body: string): void {
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
