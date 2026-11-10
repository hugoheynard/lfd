/**
 * **« Ces points de retrait existent-ils, et comment s'appellent-ils ? »**
 * (`documentation/promotions/promotions.md`, § 2.14) —
 * déclaré par les promotions, implémenté par les sites, relié par
 * `appBootstrap`.
 *
 * Un site ARCHIVÉ existe encore (il s'archive, il ne se supprime pas, § 8.2) :
 * une promotion qui le nomme se révise sans qu'on l'en retire.
 */
export abstract class PickupPointDirectory {
  /** Le libellé de chaque site qui existe ; un site absent de la carte n'existe pas. */
  abstract labelsOf(pickupIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
