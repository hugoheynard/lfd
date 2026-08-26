/**
 * Génère le token rotatif d'un QR de table. **Port** (comme `PimIdGenerator`) : le
 * domaine dépend de l'abstraction, l'infrastructure fournit l'aléa. Un token
 * neuf remplace l'ancien — ce qui invalide tout QR déjà imprimé.
 */
export abstract class TableTokenGenerator {
  abstract next(): string;
}
