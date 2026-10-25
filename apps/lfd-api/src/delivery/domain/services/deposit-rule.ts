/**
 * **« Déposé avec preuve » est-il permis ?** (`documentation/livraisons/livreur/a-la-porte.md`,
 * AP-Q6, B3, LB-Q5 du 2026-10-01 ; AP-Q1 remplacée par la décision de Hugo
 * du 2026-10-25, « dépôt A »).
 *
 * Deux chemins, et deux seulement :
 * - **aucune signature n'est exigée** : le livreur peut déposer, que le
 *   client ait autorisé le dépôt à l'adresse ou non (2026-10-25 — jusque-là,
 *   il fallait aussi « dépôt autorisé », AP-Q1). « Dépôt veut vraiment dire
 *   je ne pose pas de signature » : pour le livreur seul, la signature
 *   l'emporte toujours (AP-Q6) ;
 * - **un commercial** l'a autorisé pour CET arrêt (B3) : sa décision tracée
 *   l'emporte sur la signature (LB-Q5, « le commercial l'emporte »).
 *
 * ⚠️ « Dépôt autorisé » du carnet (`deposit_allowed`, figé au départ) n'entre
 * donc plus dans la règle : la colonne et le réglage restent, sans effet sur
 * le dépôt (vérifié le 2026-10-25) — à Hugo de dire s'il sort de l'écran.
 *
 * ⏳ **Décision PROVISOIRE** (Hugo, 2026-10-25, « pour le moment », à revoir) :
 * quand le client n'autorise pas le dépôt mais que le réglage côté commercial
 * autorise le dépôt « sauvage », le commercial l'emporte.
 *
 * La signature exigée est la valeur FIGÉE au départ ; l'autorisation du
 * commercial est la décision VIVANTE de l'arrêt.
 *
 * La règle vit ici, une fois : l'écran du livreur lit le résultat, il ne la
 * refait pas, et l'écrivain du dépôt l'appelle aussi.
 */
export function depositPermitted(stop: {
  readonly signatureRequired: boolean;
  readonly depositAuthorized: boolean;
}): boolean {
  return stop.depositAuthorized || !stop.signatureRequired;
}
