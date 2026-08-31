import { Body, Controller, Get, Param, ParseIntPipe, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import type { CatalogRevisionDiffView, CatalogRevisionSummaryView } from "@lfd/pim-contracts";

import { DiffCatalogRevisionsQuery } from "../application/diff-catalog-revisions.js";
import { ListCatalogRevisionsQuery } from "../application/list-catalog-revisions.js";
import {
  TakeCatalogRevisionCommand,
  type TakenRevision,
} from "../application/take-catalog-revision.js";

/**
 * Le libellé qu'on donne à une ancre. Facultatif : la plupart des captures sont
 * des repères, et forcer un nom ferait écrire « test » quatre-vingt-dix fois.
 */
const takeRevisionPayloadSchema = z.object({
  label: z.string().trim().min(1).max(120).nullish(),
});
type TakeRevisionPayload = z.infer<typeof takeRevisionPayloadSchema>;

/**
 * **Poser un point d'ancrage sur le catalogue.**
 *
 * `POST`, et il est **idempotent par le contenu** : sur un catalogue inchangé,
 * il rend l'ancre existante avec `created: false` au lieu d'en créer une
 * seconde. Un bouton cliqué deux fois ne double donc pas l'histoire.
 */
@AdminSurface("catalog")
@Controller("catalogue/revisions")
export class CatalogRevisionController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les ancres, de la plus récente à la plus ancienne. */
  @Get()
  list(): Promise<readonly CatalogRevisionSummaryView[]> {
    return this.queries.execute<ListCatalogRevisionsQuery, readonly CatalogRevisionSummaryView[]>(
      new ListCatalogRevisionsQuery(),
    );
  }

  /**
   * Ce qui a changé entre deux ancres, **par leur numéro**.
   *
   * Deux paramètres de chemin plutôt qu'une requête : un diff est une ressource,
   * il se partage par son URL — « regarde ce qui a bougé entre la 11 et la 12 »
   * doit tenir dans un lien collé dans une conversation.
   *
   * L'ordre est celui qu'on demande. Le renverser échange « ajouté » et
   * « retiré », et c'est voulu : on regarde parfois en arrière.
   */
  @Get(":from/diff/:to")
  diff(
    @Param("from", ParseIntPipe) from: number,
    @Param("to", ParseIntPipe) to: number,
  ): Promise<CatalogRevisionDiffView> {
    return this.queries.execute<DiffCatalogRevisionsQuery, CatalogRevisionDiffView>(
      new DiffCatalogRevisionsQuery(from, to),
    );
  }

  @Post()
  take(
    @Body(new ZodBody(takeRevisionPayloadSchema)) body: TakeRevisionPayload,
  ): Promise<TakenRevision> {
    return this.commands.execute<TakeCatalogRevisionCommand, TakenRevision>(
      new TakeCatalogRevisionCommand(body.label ?? null),
    );
  }
}
