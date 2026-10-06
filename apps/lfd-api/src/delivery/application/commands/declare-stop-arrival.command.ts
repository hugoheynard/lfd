/**
 * **« Je suis arrivé »** sur un arrêt de MA tournée (`a-la-porte.md`,
 * AP-D6). `staffUserId` est la fiche de la requête : c'est le mur.
 */
export class DeclareStopArrivalCommand {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
    readonly stopId: string,
  ) {}
}
