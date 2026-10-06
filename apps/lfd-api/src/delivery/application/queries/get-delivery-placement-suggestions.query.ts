/**
 * **Les places suggérées** d'un jour (CA7) : pour chaque commande à répartir,
 * où l'insérer dans les tournées enregistrées. Une LECTURE : rien n'est
 * écrit, et elle ne sort que vers la carte routière.
 */
export class GetDeliveryPlacementSuggestionsQuery {
  constructor(readonly day: string) {}
}
