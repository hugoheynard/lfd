/** Les chiffres de chaque règle sur une période, jours métier bornes comprises (RS3). */
export class ListStaffSuggestionCountersQuery {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {}
}
