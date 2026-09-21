/**
 * Pose le prix **public** d'un article — une intention du back-office, nommée
 * dans le vocabulaire du commercial (cf. `catalog-decision-support.ts`).
 *
 * ⚠️ Le prix est en **centimes TTC**, et le nom du champ le dit. Son jumeau
 * professionnel porte des millicentimes hors taxe : deux commandes dont les
 * champs s'appelleraient pareil finiraient par se recopier l'une l'autre.
 */
export class SetPublicPriceCommand {
  constructor(
    readonly sku: string,
    readonly ttcCents: number,
    readonly decidedBy: string | null,
  ) {}
}
