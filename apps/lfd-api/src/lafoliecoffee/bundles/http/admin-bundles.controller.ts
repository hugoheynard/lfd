import {
  createBundlePayloadSchema,
  editBundlePresentationPayloadSchema,
  saveBundleCompositionPayloadSchema,
  type BundleChoiceCandidateView,
  type BundleKeyResponse,
  type BundleView,
  type CreateBundlePayload,
  type EditBundlePresentationPayload,
  type SaveBundleCompositionPayload,
} from "@lfd/contracts";
import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { CreateBundleCommand } from "../application/commands/create-bundle.command.js";
import { EditBundlePresentationCommand } from "../application/commands/edit-bundle-presentation.command.js";
import { ReturnBundleToDraftCommand } from "../application/commands/return-bundle-to-draft.command.js";
import { SaveBundleCompositionCommand } from "../application/commands/save-bundle-composition.command.js";
import { WithdrawBundleCommand } from "../application/commands/withdraw-bundle.command.js";
import { GetBundleQuery } from "../application/queries/get-bundle.query.js";
import { ListBundlesQuery } from "../application/queries/list-bundles.query.js";
import { SearchBundleChoicesQuery } from "../application/queries/search-bundle-choices.query.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

const searchTermSchema = z.string().optional();

/**
 * **Les formules** — `/admin/bundles` (`documentation/formules/plan-les-formules.md`,
 * lot F2a : la composition, sans prix).
 *
 * Sous `shop_bundles` : un droit à lui, en Gestion Boutique. La clé est dans
 * l'URL — tirée du nom à la création, puis immuable. Une section de l'écran =
 * un `PUT`. Pas de `DELETE` : on retire.
 *
 * La recherche d'articles vit sous `/admin/bundle-choices`, hors de
 * `/admin/bundles/:key` : une formule nommée « Choices » aurait sinon caché la
 * route, ou l'inverse.
 */
@Controller("admin")
@AdminSurface("shop_bundles")
export class AdminBundlesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get("bundles")
  list(): Promise<readonly BundleView[]> {
    return this.queries.execute<ListBundlesQuery, readonly BundleView[]>(new ListBundlesQuery());
  }

  @Get("bundles/:key")
  get(@Param("key") key: string): Promise<BundleView> {
    return this.queries.execute<GetBundleQuery, BundleView>(new GetBundleQuery(key));
  }

  /** Les articles qu'on peut ajouter : servis au public, pas réservés aux opérations. */
  @Get("bundle-choices")
  searchChoices(
    @Query("q", new ZodQuery(searchTermSchema)) term: string | undefined,
  ): Promise<readonly BundleChoiceCandidateView[]> {
    return this.queries.execute<SearchBundleChoicesQuery, readonly BundleChoiceCandidateView[]>(
      new SearchBundleChoicesQuery(term ?? ""),
    );
  }

  @Post("bundles")
  @Idempotent(
    "création : rejouée, la clé tirée du nom est déjà prise et le cas d'usage refuse (409 BundleKeyTakenError) avant tout tirage d'identifiant ni écriture ; l'index unique tient la course entre deux onglets",
  )
  async create(
    @Body(new ZodBody(createBundlePayloadSchema)) body: CreateBundlePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<BundleKeyResponse> {
    const key = await this.commands.execute<CreateBundleCommand, string>(
      new CreateBundleCommand(body, staffUserId),
    );
    return { key };
  }

  /** Nom et description. */
  @Put("bundles/:key/presentation")
  @Idempotent(
    "pose des valeurs : rejouée, la même requête laisse le nom et la description inchangés, et le handler rend avant toute écriture ni tout fait",
  )
  async editPresentation(
    @Param("key") key: string,
    @Body(new ZodBody(editBundlePresentationPayloadSchema)) body: EditBundlePresentationPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<BundleKeyResponse> {
    await this.commands.execute<EditBundlePresentationCommand, void>(
      new EditBundlePresentationCommand(key, body, staffUserId),
    );
    return { key };
  }

  /** Les groupes et leurs choix, ENTIERS, dans l'ordre voulu. */
  @Put("bundles/:key/composition")
  @Idempotent(
    "pose des valeurs : rejouée, la même composition laisse les groupes inchangés, et le handler rend avant toute écriture ni tout fait",
  )
  async saveComposition(
    @Param("key") key: string,
    @Body(new ZodBody(saveBundleCompositionPayloadSchema)) body: SaveBundleCompositionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<BundleKeyResponse> {
    await this.commands.execute<SaveBundleCompositionCommand, void>(
      new SaveBundleCompositionCommand(key, body.groups, staffUserId),
    );
    return { key };
  }

  @Put("bundles/:key/withdraw")
  @Idempotent(
    "transition : rejouée sur une formule retirée, l'agrégat refuse (409 BundleAlreadyWithdrawnError) avant toute écriture ni tout fait",
  )
  async withdraw(
    @Param("key") key: string,
    @StaffUserId() staffUserId: string,
  ): Promise<BundleKeyResponse> {
    await this.commands.execute<WithdrawBundleCommand, void>(
      new WithdrawBundleCommand(key, staffUserId),
    );
    return { key };
  }

  @Put("bundles/:key/draft")
  @Idempotent(
    "transition : rejouée sur une formule en brouillon, l'agrégat refuse (409 BundleAlreadyDraftError) avant toute écriture ni tout fait",
  )
  async returnToDraft(
    @Param("key") key: string,
    @StaffUserId() staffUserId: string,
  ): Promise<BundleKeyResponse> {
    await this.commands.execute<ReturnBundleToDraftCommand, void>(
      new ReturnBundleToDraftCommand(key, staffUserId),
    );
    return { key };
  }
}
