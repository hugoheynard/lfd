/**
 * **« Quelle zone livre ce code postal ? »** (`documentation/promotions/promotions.md`, § 2.14) — la
 * règle même des frais (le préfixe le plus long), pour que le fait
 * d'acheminement jugé par les promotions porte la zone que la caisse
 * facturera. Déclaré par les commandes, implémenté par les zones de
 * livraison : les promotions reçoivent le fait déjà résolu.
 */
export abstract class DeliveryZoneOfPostalCodeReader {
  /** L'identifiant de la zone ; `null` = aucune zone ne couvre ce code postal. */
  abstract zoneIdOf(codePostal: string): Promise<string | null>;
}
