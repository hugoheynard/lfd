/**
 * **Arrêter une journée de fabrication.**
 *
 * Le jour arrive en `string` : le handler le passe par `ServiceDay`, qui refuse
 * ce qui n'est pas un jour ISO. Valider ici obligerait chaque appelant à le
 * faire ; le faire une fois, dans le domaine, rend l'invalide inexprimable.
 */
export class CloseProductionDayCommand {
  constructor(readonly serviceDay: string) {}
}
