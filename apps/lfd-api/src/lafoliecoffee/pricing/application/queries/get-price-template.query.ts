/**
 * « Que contient cette grille-là ? » — `null` si aucune ne porte cet
 * identifiant.
 *
 * L'absence est rendue plutôt que refusée : c'est le contrôleur qui décide de la
 * traduire en 404, parce que c'est lui qui parle HTTP.
 */
export class GetPriceTemplateQuery {
  constructor(readonly id: string) {}
}
