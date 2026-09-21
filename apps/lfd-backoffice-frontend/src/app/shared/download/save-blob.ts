/**
 * Enregistre un blob sous un nom, depuis une réponse **authentifiée**.
 *
 * ## Pourquoi ce détour, alors qu'un `<a href>` suffirait
 *
 * Parce qu'il ne suffit pas. Un lien vers `/admin/…/export.csv` part sans le
 * jeton staff — l'intercepteur ne voit que les requêtes `HttpClient` — et rend
 * un 401 que le navigateur affiche comme une page blanche. Le fichier se
 * récupère donc en mémoire, puis se donne au navigateur sous forme d'URL
 * d'objet.
 *
 * L'URL est révoquée après un délai plutôt qu'immédiatement : le clic est
 * asynchrone, et la révoquer dans la foulée annule le téléchargement sur
 * certains navigateurs. Ne jamais la révoquer ferait fuir le blob pour la durée
 * de l'onglet — un CSV de quatre cents lignes à chaque clic, sur un écran qu'on
 * laisse ouvert la journée.
 *
 * ⚠️ Trois copies de cette même danse existent ailleurs dans l'app (le bon de
 * commande, l'extrait KBIS, le QR d'un point de vente — vérifié le 2026-09-10).
 * Elles ne sont pas reprises ici : chacune fait un geste légèrement différent
 * (ouvrir un onglet, nommer depuis une fiche), et les fondre demanderait de
 * décider ce que le helper doit couvrir. Ce fichier est le point de convergence
 * quand quelqu'un s'y attellera.
 */
const REVOKE_DELAY_MS = 60_000;

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
