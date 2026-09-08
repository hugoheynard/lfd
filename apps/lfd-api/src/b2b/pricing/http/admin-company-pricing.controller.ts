import {
  closeCompanyMercurialePayloadSchema,
  poseCompanyMercurialePayloadSchema,
  saveMercurialeDraftPayloadSchema,
  type AffectedRulesResponse,
  type CloseCompanyMercurialePayload,
  type CompanyPricingView,
  type MercurialeDraftResponse,
  type PoseCompanyMercurialePayload,
  type SaveMercurialeDraftPayload,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffSub } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  CloseCompanyMercurialeCommand,
  PoseCompanyMercurialeCommand,
} from "../application/commands/company-mercuriale.handlers.js";
import { CompanyPricingQuery } from "../application/queries/company-pricing.query.js";
import { MercurialeDrafts } from "../application/mercuriale-drafts.store.js";

/**
 * **La tarification d'UN client** — l'onglet « Tarifs » de sa fiche.
 *
 * ## Pourquoi `b2b_pricing` et non `b2b_companies`
 *
 * La fiche d'un compte s'ouvre avec `b2b_companies:read`, que portent aussi la
 * comptabilité et le support. Monter cette surface sur ce droit-là **donnerait**
 * à tout le monde la lecture des prix négociés, qui n'appartient aujourd'hui
 * qu'à qui détient `b2b_pricing`.
 *
 * On garde donc le droit de la tarification, et le front cache l'onglet à qui
 * ne l'a pas : personne ne gagne un accès, personne n'en perd. Élargir est une
 * décision à prendre à part, pas un effet de bord de l'endroit où on a rangé un
 * écran.
 *
 * ## Pourquoi un contrôleur à part de `AdminPricingController`
 *
 * Celui-là parle du catalogue — tous clients confondus —, celui-ci d'un dossier.
 * Le préfixe le dit (`/companies/:companyId`), et le mur tenant du B2B n'entre
 * pas en jeu : le staff n'appartient à aucune société, c'est `@AdminSurface` qui
 * l'autorise.
 */
@Controller("admin/pricing/companies/:companyId")
@AdminSurface("b2b_pricing")
export class AdminCompanyPricingController {
  constructor(
    private readonly commands: CommandBus,
    private readonly pricing: CompanyPricingQuery,
    private readonly drafts: MercurialeDrafts,
  ) {}

  /** Ce que ce client paie **aujourd'hui**, article par article, et ses mercuriales. */
  @Get()
  async read(@Param("companyId") companyId: string): Promise<CompanyPricingView> {
    return this.pricing.forCompany(companyId);
  }

  /**
   * **Poser une mercuriale.** Rend le nombre de règles écrites — une ligne, une
   * règle, tant que la mercuriale est à prix fixe.
   *
   * Refuse si une mercuriale couvre déjà la période sur un de ces articles, en
   * la nommant : la sortie est de la clore, et la route d'à côté le fait.
   */
  @Post("mercuriale")
  @HttpCode(HttpStatus.CREATED)
  async pose(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(poseCompanyMercurialePayloadSchema)) payload: PoseCompanyMercurialePayload,
    @StaffSub() staffSub: string,
  ): Promise<AffectedRulesResponse> {
    const affectedRules = await this.commands.execute<PoseCompanyMercurialeCommand, number>(
      new PoseCompanyMercurialeCommand(companyId, payload, staffSub),
    );
    return { affectedRules };
  }

  /**
   * **Clore une mercuriale en cours.** `POST` et non `DELETE` : rien n'est
   * supprimé — ses règles sont archivées, et une lecture datée d'avant la
   * clôture les retrouve. Un `DELETE` promettrait l'inverse.
   */
  @Post("mercuriale/close")
  @HttpCode(HttpStatus.OK)
  async close(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(closeCompanyMercurialePayloadSchema)) payload: CloseCompanyMercurialePayload,
    @StaffSub() staffSub: string,
  ): Promise<AffectedRulesResponse> {
    const affectedRules = await this.commands.execute<CloseCompanyMercurialeCommand, number>(
      new CloseCompanyMercurialeCommand(companyId, payload, staffSub),
    );
    return { affectedRules };
  }

  /**
   * **Le brouillon en cours**, ou `null`.
   *
   * `draft: null` et non un 404 : « ce compte n'a pas de négociation ouverte »
   * est une réponse, pas une absence de ressource. L'écran s'en sert pour
   * choisir entre l'état vide et la reprise, et un 404 l'obligerait à traiter un
   * cas normal comme une erreur.
   *
   * Enveloppé plutôt que rendu nu : un `null` de contrôleur part en corps VIDE,
   * et « pas de brouillon » cesserait de se distinguer de « pas de corps ».
   */
  @Get("mercuriale/draft")
  async draft(@Param("companyId") companyId: string): Promise<MercurialeDraftResponse> {
    return { draft: await this.drafts.forCompany(companyId) };
  }

  /**
   * **Enregistrer le brouillon.** `PUT` et non `PATCH` : il se remplace entier,
   * comme la grille qu'il porte. Un brouillon fusionné ligne à ligne garderait
   * un prix qu'on vient précisément de retirer.
   */
  @Put("mercuriale/draft")
  @HttpCode(HttpStatus.NO_CONTENT)
  async saveDraft(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(saveMercurialeDraftPayloadSchema)) payload: SaveMercurialeDraftPayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.drafts.save(companyId, payload, staffSub);
  }

  /** **Jeter le brouillon.** Silencieux s'il n'y en a pas : l'état visé est atteint. */
  @Delete("mercuriale/draft")
  @HttpCode(HttpStatus.NO_CONTENT)
  async discardDraft(@Param("companyId") companyId: string): Promise<void> {
    await this.drafts.discard(companyId);
  }
}
