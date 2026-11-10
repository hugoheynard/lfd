/**
 * **Le jeton du lien d'annulation d'un invité** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.4, B1).
 *
 * Déterministe : `base64url(HMAC-SHA256(orderId, clé))` — rien de stocké, un
 * rejeu du courriel donne le même lien. Le jeton IDENTIFIE la commande, il ne
 * décide rien : la décision d'annuler se prend au serveur, sous verrou.
 *
 * Une rotation de la clé tue tous les liens déjà envoyés : assumé.
 */
export abstract class CancellationLinkSigner {
  abstract sign(orderId: string): string;
  /** Recalcul et comparaison en temps constant. */
  abstract matches(orderId: string, token: string): boolean;
}
