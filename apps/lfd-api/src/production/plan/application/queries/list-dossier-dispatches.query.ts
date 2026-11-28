/** Les destinataires du dossier, et la dernière version que chacun a reçue de la journée. */
export class ListDossierDispatchesQuery {
  constructor(readonly serviceDay: string) {}
}
