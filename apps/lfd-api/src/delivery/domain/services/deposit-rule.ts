/**
 * **« Déposé avec preuve » est-il permis ?** (`documentation/livraisons/plan-a-la-porte.md`,
 * AP-Q1, AP-Q6, tranchés par Hugo le 2026-10-01).
 *
 * Il faut que le client l'ait autorisé à l'adresse — ET qu'aucune signature
 * ne soit exigée : « dépôt veut vraiment dire je ne pose pas de signature ».
 * La signature l'emporte toujours, elle est plus précise (elle peut venir de
 * la commande elle-même). Les deux valeurs sont celles FIGÉES au départ.
 *
 * La règle vit ici, une fois : l'écran du livreur lit le résultat, il ne la
 * refait pas, et l'écrivain du dépôt (lot suivant) l'appellera aussi.
 */
export function depositPermitted(stop: {
  readonly depositAllowed: boolean;
  readonly signatureRequired: boolean;
}): boolean {
  return stop.depositAllowed && !stop.signatureRequired;
}
