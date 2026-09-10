/**
 * Ouvre un blob **authentifié** dans un nouvel onglet, pour le REGARDER.
 *
 * Même raison que `saveBlob` de ne pas poser un `<a href>` sur la route : elle
 * est derrière le jeton staff, que seul l'intercepteur `HttpClient` pose. Une
 * navigation nue rendrait un 401 affiché en page blanche.
 *
 * 🔴 **La révocation est différée, et ce n'est pas une fuite oubliée.**
 * `URL.revokeObjectURL` appelé dans la foulée coupe l'URL sous l'onglet qui
 * vient de s'ouvrir : celui-ci n'a pas encore chargé les octets, et affiche une
 * page vide ou une erreur de réseau. Ne jamais révoquer garderait le blob en
 * mémoire pour la durée de l'onglet appelant, qu'un back-office laisse ouvert
 * la journée. D'où le délai : assez long pour que le lecteur PDF ait lu, assez
 * court pour que dix contrôles d'affilée ne s'accumulent pas.
 *
 * @returns `false` quand le navigateur a refusé l'onglet (bloqueur de fenêtres).
 *   L'appelant le DIT : sans onglet ni fichier, un clic sans effet visible se
 *   lit comme un bouton cassé.
 */
const REVOKE_DELAY_MS = 60_000;

export function openBlob(blob: Blob): boolean {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  return opened !== null;
}
