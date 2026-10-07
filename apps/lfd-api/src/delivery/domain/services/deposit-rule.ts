/**
 * **« Déposé avec preuve » est-il permis ?** (`documentation/livraisons/livreur/a-la-porte.md`,
 * AP-Q1, AP-Q6, B3, LB-Q5, tranchés par Hugo le 2026-10-01).
 *
 * Deux chemins, et deux seulement :
 * - **le client** l'a autorisé à l'adresse ET aucune signature n'est exigée :
 *   « dépôt veut vraiment dire je ne pose pas de signature » — pour le
 *   livreur seul, la signature l'emporte (AP-Q6) ;
 * - **un commercial** l'a autorisé pour CET arrêt (B3) : sa décision tracée
 *   l'emporte sur la signature (LB-Q5, « le commercial l'emporte »).
 *
 * Les valeurs du client sont celles FIGÉES au départ ; l'autorisation du
 * commercial est la décision VIVANTE de l'arrêt.
 *
 * La règle vit ici, une fois : l'écran du livreur lit le résultat, il ne la
 * refait pas, et l'écrivain du dépôt l'appelle aussi.
 */
export function depositPermitted(stop: {
  readonly depositAllowed: boolean;
  readonly signatureRequired: boolean;
  readonly depositAuthorized: boolean;
}): boolean {
  return stop.depositAuthorized || (stop.depositAllowed && !stop.signatureRequired);
}
