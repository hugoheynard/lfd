import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { MediaCarrierView } from "@lfd/pim-contracts";

import { MediaCarriers } from "../channels/carriers/media-carriers.js";

/** Qui affiche cette image — nommés, pas comptés. */
export class ListMediaCarriersQuery {
  constructor(readonly url: string) {}
}

/**
 * **La liste des porteurs d'une image.**
 *
 * 🔴 Elle existe pour rendre le refus de suppression ACTIONNABLE. Le compteur
 * disait « 3 fiches l'affichent » et s'arrêtait là : on empêchait le geste sans
 * donner de quoi le débloquer, ce qui transforme un garde-fou en mur.
 *
 * ⚠️ **Elle ne décide rien.** La suppression continue de consulter le COMPTE
 * (`usesOf`), et pas cette liste : décider sur une liste nommée ferait dépendre
 * un refus de la capacité à produire un libellé. Deux questions, deux chemins —
 * et un seul des deux a le droit de refuser.
 *
 * Une image que personne n'affiche rend une liste **vide**, jamais une erreur :
 * c'est l'état normal d'une orpheline, celle que le ramassage emportera.
 */
@QueryHandler(ListMediaCarriersQuery)
export class ListMediaCarriersHandler implements IQueryHandler<
  ListMediaCarriersQuery,
  readonly MediaCarrierView[]
> {
  constructor(private readonly carriers: MediaCarriers) {}

  async execute(query: ListMediaCarriersQuery): Promise<readonly MediaCarrierView[]> {
    const url = query.url.trim();
    if (url === "") {
      // Pas une erreur : une URL vide ne désigne rien, et personne n'affiche
      // rien. Lever ici obligerait l'écran à distinguer deux vides.
      return [];
    }
    return this.carriers.carriersOf(url);
  }
}
