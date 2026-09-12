/**
 * Port **FieldCipher** — le coffre d'un CHAMP, pas d'une base.
 *
 * Il scelle une valeur avant qu'elle entre en colonne, et l'ouvre à la
 * relecture. Ce qu'il protège est précis, et le nommer évite de lui prêter des
 * vertus qu'il n'a pas :
 *
 * **Contre quoi il protège** — une copie de la base qui sort sans la clé :
 * sauvegarde égarée, accès en lecture obtenu par un défaut applicatif, dump
 * confié à un prestataire. C'est le vecteur de fuite le plus probable, et le
 * seul que le chiffrement de colonne ferme réellement.
 *
 * **Contre quoi il ne protège PAS** — un serveur compromis, qui détient la clé
 * par construction ; ni une requête légitime faite par une personne qui ne
 * devrait pas la faire, qui relève du mur tenant et des rôles.
 *
 * ## Pourquoi un port, et pas un appel direct à `node:crypto`
 *
 * Pour la même raison que `Clock` et `SecretGenerator` : la valeur scellée est
 * **non déterministe** (chaque scellement tire un IV neuf), donc un domaine qui
 * chiffrerait lui-même cesserait d'être testable sans dérogation. Et parce que
 * la rotation de clé se joue dans l'adaptateur, où elle ne dérange personne.
 */
export abstract class FieldCipher {
  /**
   * Scelle une valeur. Deux appels sur la même entrée rendent deux scellés
   * **différents** — c'est voulu : un scellé déterministe laisserait comparer
   * deux lignes pour savoir si elles portent le même compte, sans clé.
   */
  abstract seal(plaintext: string): string;

  /**
   * Rouvre un scellé.
   *
   * @throws {SealedValueUnreadableError} scellé corrompu, tronqué, ou produit
   *   sous une autre clé.
   */
  abstract open(sealed: string): string;
}
