/**
 * Ce qu'il y a derrière le QR d'une fiche d'atelier — **avant** de déclarer quoi
 * que ce soit. Lue par la référence, qui est le contenu du code.
 */
export class GetPackingQuery {
  constructor(readonly reference: string) {}
}
