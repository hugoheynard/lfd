/**
 * « Une négociation est-elle ouverte sur ce compte, et où en est-elle ? »
 *
 * L'absence de brouillon est une **réponse** — l'écran choisit entre l'état vide
 * et la reprise —, pas une ressource manquante : la question rend `null` et
 * jamais un refus.
 */
export class ReadMercurialeDraftQuery {
  constructor(readonly companyId: string) {}
}
