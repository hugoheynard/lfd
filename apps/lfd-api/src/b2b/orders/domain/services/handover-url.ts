/**
 * **L'URL que le QR de retrait encode** — une seule fabrique, pour les trois
 * courriels qui l'affichent et pour le bon de commande qui l'imprime (plan
 * `documentation/order/plan-bon-public.md`, §5).
 *
 * Elle pointe le **back-office** : c'est l'équipe qui scanne, pas le client.
 * La page `/retrait/<jeton>` exige un membre du staff connecté qui a le droit
 * du retrait ; le jeton seul n'ouvre rien.
 *
 * Rend une chaîne **vide** quand il n'y a pas de jeton ou que l'origine admin
 * n'est pas configurée : un code qui n'ouvre rien vaut moins qu'un numéro de
 * commande lisible, et les gabarits lisent déjà le vide comme « pas de QR ».
 */
export function handoverUrlOf(adminBaseUrl: string | null, token: string | null): string {
  return token === null || adminBaseUrl === null ? "" : `${adminBaseUrl}/retrait/${token}`;
}
