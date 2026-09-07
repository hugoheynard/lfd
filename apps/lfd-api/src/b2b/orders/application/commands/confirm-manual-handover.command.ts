/**
 * Atteste une remise **saisie à la main**, par le numéro de commande.
 *
 * Le chemin de secours du comptoir et de la tournée : le destinataire n'a pas
 * son courriel — un magasinier, quelqu'un d'autre à l'accueil, un téléphone
 * déchargé. Sans cette porte, quelqu'un proposerait d'imprimer le code sur le
 * colis « pour les livraisons difficiles », et un coursier scannerait son propre
 * carton.
 *
 * `staffSubject` vient du `Principal`, jamais de la charge utile : c'est ce qui
 * fait qu'une attestation faible reste une attestation.
 */
export class ConfirmManualHandoverCommand {
  constructor(
    readonly reference: string,
    readonly staffSubject: string,
  ) {}
}
