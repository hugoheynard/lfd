/**
 * **« Ces zones existent-elles, et comment s'appellent-elles ? »** (plan
 * `documentation/promotions/plan-acheminements-a-cocher.md`, § 9) — déclaré
 * par les promotions, implémenté par les zones de livraison, relié par
 * `appBootstrap`. Aucun des deux modules n'importe l'autre.
 *
 * Sert à refuser une zone inconnue AVANT la base (jamais une violation de
 * clé étrangère) et à nommer les zones dans le journal, figées au fait.
 */
export abstract class DeliveryZoneDirectory {
  /** Le libellé de chaque zone qui existe ; une zone absente de la carte n'existe pas. */
  abstract labelsOf(zoneIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
