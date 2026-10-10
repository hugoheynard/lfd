import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { MediaTagView } from "@lfd/pim-contracts";

import { MediaTagReader } from "../domain/ports/media-tags.js";

/**
 * Le vocabulaire de TOUT le fonds, compté.
 *
 * 🔴 Il existe parce que la bande de l'écran dérivait ses mots des images
 * CHARGÉES : un mot porté seulement hors de la page n'y figurait pas, et rien
 * ne le disait (plan L1, 2026-10-10).
 */
export class ListMediaTagsQuery {}

@QueryHandler(ListMediaTagsQuery)
export class ListMediaTagsHandler implements IQueryHandler<
  ListMediaTagsQuery,
  readonly MediaTagView[]
> {
  constructor(private readonly tags: MediaTagReader) {}

  async execute(): Promise<readonly MediaTagView[]> {
    const vocabulary = await this.tags.vocabulary();
    return vocabulary.map(({ tag, count }) => ({ tag, count }));
  }
}
