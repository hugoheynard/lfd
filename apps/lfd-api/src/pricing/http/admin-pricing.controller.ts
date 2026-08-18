import {
  createPriceRulePayloadSchema,
  priceProjectionPayloadSchema,
  pricingReasonPayloadSchema,
  renamePriceRulePayloadSchema,
  setVolumeLadderPayloadSchema,
  type CreatePriceRulePayload,
  type PriceProjectionPayload,
  type PriceProjectionView,
  type PricingReasonPayload,
  type RenamePriceRulePayload,
  type SetVolumeLadderPayload,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../infra/auth/admin-surface.decorator.js";
import { Clock } from "../../infra/time/clock.js";
import { PriceProjectionQuery } from "../application/queries/price-projection.query.js";
import { StaffSub } from "../../infra/auth/staff.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import {
  ArchivePriceRuleCommand,
  CreatePriceRuleCommand,
  PausePriceRuleCommand,
  RenamePriceRuleCommand,
  ResumePriceRuleCommand,
  SetVolumeLadderCommand,
  PauseVolumeLadderCommand,
  ResumeVolumeLadderCommand,
  ArchiveVolumeLadderCommand,
} from "../application/commands/pricing.commands.js";
import { BoardComparisonService } from "../application/board-comparison.service.js";
import { InvalidPricingInstantError } from "../domain/pricing-errors.js";
import { PricingBoardReader } from "../application/ports/pricing-board.reader.js";
import type {
  PriceRuleView,
  PriceScopePayload,
  PricingBoardView,
  PricingComparisonView,
} from "@lfd/contracts";
import type { PricingRuleDraft } from "../domain/entities/pricing-rule.js";
import type { PriceScope } from "../domain/price-rule.js";

/**
 * **Le paramétrage tarifaire.**
 *
 * Une route par geste : poser une règle, la retirer, poser une limite, la
 * retirer. Retirer est un `DELETE` et jamais un `PUT { value: null }` — on
 * supprime une décision, on n'en pose pas une qui vaudrait « rien ».
 *
 * Le plancher se retire par sa **portée** et non par un identifiant : c'est ce
 * que l'écran connaît, et l'identifiant en dérive de toute façon. Demander un id
 * aurait obligé le client à le transporter pour rien.
 *
 * Surface staff murée par `@AdminSurface("settings")`, comme le catalogue :
 * décider d'un prix est du réglage.
 */
@Controller("admin/pricing")
@AdminSurface("settings")
export class AdminPricingController {
  constructor(
    private readonly board: PricingBoardReader,
    private readonly comparison: BoardComparisonService,
    private readonly commands: CommandBus,
    private readonly projection: PriceProjectionQuery,
    private readonly clock: Clock,
  ) {}

  /**
   * Le tableau complet — familles, articles, règles, limites, prix résolus.
   *
   * `?at=<ISO>` le rend **tel qu'il était** : les règles archivées après cet
   * instant y reviennent, les suspensions postérieures ne comptent pas. Ce que
   * la lecture datée montre, ce sont les DÉCISIONS en vigueur ce jour-là — pas
   * le prix facturé, le tarif canonique n'étant pas historisé.
   *
   * `readForScreen` et non `read` : c'est la seule route qui montre le rapport
   * prix/volume, donc la seule qui doive payer les requêtes de ventes.
   */
  @Get()
  read(@Query("at") at?: string): Promise<PricingBoardView> {
    return this.board.readForScreen(at === undefined ? undefined : parseInstant(at));
  }

  /**
   * **Deux marqueurs, et ce qui a bougé entre eux** : le prix par article, et le
   * volume vendu comparé à la fenêtre miroir d'avant.
   *
   * Une route à part et non deux appels datés recollés dans le navigateur : le
   * volume se mesure sur la fenêtre QUI SÉPARE les marqueurs, et cette fenêtre
   * n'existe dans aucune des deux lectures.
   */
  @Get("comparison")
  compare(@Query("from") from: string, @Query("to") to: string): Promise<PricingComparisonView> {
    return this.comparison.compare(parseInstant(from), parseInstant(to));
  }

  /**
   * **Ce qu'on a rangé** — les règles archivées, de la plus récente à la plus
   * ancienne.
   *
   * Une route à part et non un drapeau sur le tableau : « qu'est-ce qui
   * s'applique ? » et « qu'a-t-on retiré ? » sont deux questions, et mêler les
   * secondes aux premières alourdirait chaque nœud de l'écran.
   */
  @Get("rules/archived")
  archivedRules(): Promise<PriceRuleView[]> {
    return this.board.archivedRules();
  }

  /**
   * **Poser un barème de volume** — l'échelle entière, d'un coup.
   *
   * `PUT` et non `POST` sur des paliers : les paliers d'une cible forment UNE
   * décision, et se remplacent ensemble. Poser palier par palier laisserait,
   * entre deux appels, un barème qui régresse — exactement ce que l'échelle
   * existe pour rendre impossible.
   */
  @Put("volume-ladders")
  @HttpCode(HttpStatus.CREATED)
  async setVolumeLadder(
    @Body(new ZodBody(setVolumeLadderPayloadSchema)) payload: SetVolumeLadderPayload,
    @StaffSub() staffSub: string,
  ): Promise<{ id: string }> {
    const id = await this.commands.execute<SetVolumeLadderCommand, string>(
      new SetVolumeLadderCommand(
        {
          scope: { type: payload.scope.type, id: payload.scope.id },
          audience: { type: payload.audience.type, id: payload.audience.id },
          unit: payload.unit,
          tiers: payload.tiers,
          label: payload.label,
          validFrom: new Date(payload.validFrom),
          validTo: payload.validTo === null ? null : new Date(payload.validTo),
        },
        staffSub,
      ),
    );
    return { id };
  }

  /**
   * **Suspendre un barème** : il cesse d'agir et garde sa place.
   *
   * Les trois gestes du barème calquent ceux de la règle — mêmes verbes, mêmes
   * sous-chemins, même exigence d'un motif à l'archivage. Un barème ne pouvait
   * jusqu'ici que naître : le port déclarait la transition, l'agrégat n'en
   * savait rien, et corriger une échelle supposait d'en poser une autre que la
   * contrainte d'exclusion refusait.
   */
  @Post("volume-ladders/:id/pause")
  @HttpCode(HttpStatus.NO_CONTENT)
  async pauseLadder(
    @Param("id") id: string,
    @Body(new ZodBody(pricingReasonPayloadSchema)) payload: PricingReasonPayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<PauseVolumeLadderCommand, void>(
      new PauseVolumeLadderCommand(id, staffSub, payload.reason),
    );
  }

  /** **Reprendre** : le barème réagit à partir de maintenant. */
  @Post("volume-ladders/:id/resume")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resumeLadder(@Param("id") id: string, @StaffSub() staffSub: string): Promise<void> {
    await this.commands.execute<ResumeVolumeLadderCommand, void>(
      new ResumeVolumeLadderCommand(id, staffSub),
    );
  }

  /**
   * **Archiver** un barème — terminal, et il rend sa place.
   *
   * C'est ce geste qui manquait le plus : sans lui, une cible portait son
   * premier barème pour toujours, la contrainte d'exclusion refusant le suivant.
   */
  @Post("volume-ladders/:id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveLadder(
    @Param("id") id: string,
    @Body(new ZodBody(pricingReasonPayloadSchema)) payload: PricingReasonPayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<ArchiveVolumeLadderCommand, void>(
      new ArchiveVolumeLadderCommand(id, staffSub, payload.reason),
    );
  }

  /** Rend l'identifiant posé : l'écran en a besoin pour cibler ses gestes. */
  /**
   * **La projection** : ce que l'article coûterait à des niveaux de cumul qui
   * n'existent pas encore.
   *
   * `POST` bien que ce soit une lecture : la liste des niveaux ne tient pas
   * proprement dans une URL, et un `GET` à vingt-quatre paramètres répétés se
   * lit moins bien qu'un corps. Rien n'est écrit, rien n'est mémorisé.
   */
  @Post("projection")
  @HttpCode(HttpStatus.OK)
  async project(
    @Body(new ZodBody(priceProjectionPayloadSchema)) payload: PriceProjectionPayload,
  ): Promise<PriceProjectionView> {
    return this.projection.project(payload, this.clock.now());
  }

  @Post("rules")
  @HttpCode(HttpStatus.CREATED)
  async createRule(
    @Body(new ZodBody(createPriceRulePayloadSchema)) payload: CreatePriceRulePayload,
    @StaffSub() staffSub: string,
  ): Promise<{ id: string }> {
    const id = await this.commands.execute<CreatePriceRuleCommand, string>(
      new CreatePriceRuleCommand(toDraft(payload), staffSub),
    );
    return { id };
  }

  /**
   * **Renommer** une règle — le libellé, et **rien d'autre**.
   *
   * Il n'y a pas de route qui remplacerait l'effet, la portée ou la fenêtre, et
   * c'est une décision : les changer sur une règle qui a déjà facturé
   * réécrirait l'explication de factures déjà payées, pendant que la trace figée
   * sur la commande garderait l'ancien montant. Pour cela, archiver puis
   * reposer — les deux décisions restent visibles côte à côte.
   *
   * `PATCH` et non `PUT` : on modifie un champ, on ne remplace pas la règle.
   */
  @Patch("rules/:id/label")
  @HttpCode(HttpStatus.NO_CONTENT)
  async renameRule(
    @Param("id") id: string,
    @Body(new ZodBody(renamePriceRulePayloadSchema)) payload: RenamePriceRulePayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<RenamePriceRuleCommand, void>(
      new RenamePriceRuleCommand(id, payload.label, staffSub),
    );
  }

  /**
   * **Suspendre** une promotion : elle cesse d'agir et garde sa place.
   *
   * `POST` sur un sous-chemin et non `PATCH { paused: true }` : ce n'est pas une
   * écriture de champ, c'est un geste daté et signé. Six mois plus tard, la
   * question posée est « qui a arrêté la promo du 12 août », et seule une
   * intention nommée y répond.
   */
  @Post("rules/:id/pause")
  @HttpCode(HttpStatus.NO_CONTENT)
  async pauseRule(
    @Param("id") id: string,
    @Body(new ZodBody(pricingReasonPayloadSchema)) payload: PricingReasonPayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<PausePriceRuleCommand, void>(
      new PausePriceRuleCommand(id, staffSub, payload.reason),
    );
  }

  /** **Reprendre** : la règle réagit à partir de maintenant. */
  @Post("rules/:id/resume")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resumeRule(@Param("id") id: string, @StaffSub() staffSub: string): Promise<void> {
    await this.commands.execute<ResumePriceRuleCommand, void>(
      new ResumePriceRuleCommand(id, staffSub),
    );
  }

  /**
   * **Archiver** — le seul geste qui retire une règle de l'écran.
   *
   * Il n'y a **pas** de suppression, et le `DELETE` d'origine est devenu cet
   * archivage : une règle a facturé, elle a fait un prix, et l'effacer effacerait
   * la réponse à « pourquoi ce prix » alors que la facture, elle, reste.
   */
  @Post("rules/:id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveRule(
    @Param("id") id: string,
    @Body(new ZodBody(pricingReasonPayloadSchema)) payload: PricingReasonPayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<ArchivePriceRuleCommand, void>(
      new ArchivePriceRuleCommand(id, staffSub, payload.reason),
    );
  }

  /**
   * L'ancien geste « retirer », qui **archive** désormais.
   *
   * Conservé parce que c'est le verbe que l'écran connaît, et que « retirer »
   * dit bien ce que le staff veut faire — la règle quitte le tableau. Ce qui a
   * changé est ce qui se passe dessous : plus rien ne s'efface.
   */
  @Delete("rules/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRule(@Param("id") id: string, @StaffSub() staffSub: string): Promise<void> {
    await this.commands.execute<ArchivePriceRuleCommand, void>(
      new ArchivePriceRuleCommand(id, staffSub, null),
    );
  }
}

/**
 * Une date ISO → un instant.
 *
 * @throws {InvalidPricingInstantError} chaîne illisible. Sans ce refus, un
 *   `Invalid Date` traverserait toutes les comparaisons en rendant `false`, et
 *   l'écran afficherait un catalogue vide sans dire pourquoi.
 */
function parseInstant(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidPricingInstantError(value);
  }
  return parsed;
}

/**
 * Payload → brouillon de domaine.
 *
 * Les dates traversent le fil en ISO et redeviennent des `Date` ici, à la
 * frontière : le domaine n'a jamais à se demander s'il tient une chaîne.
 */
function toDraft(payload: CreatePriceRulePayload): PricingRuleDraft {
  return {
    stage: payload.stage,
    scope: toScope(payload.scope),
    audience: { type: payload.audience.type, id: payload.audience.id },
    minQuantity: payload.minQuantity,
    effect:
      payload.effect.nature === "replace"
        ? { nature: "replace", amountCents: payload.effect.amountCents }
        : {
            nature: "alter",
            alteration:
              payload.effect.mode === "percent"
                ? { direction: payload.effect.direction, mode: "percent", bp: payload.effect.value }
                : {
                    direction: payload.effect.direction,
                    mode: "amount",
                    cents: payload.effect.value,
                  },
          },
    label: payload.label,
    stacksOverMercuriale: payload.stacksOverMercuriale,
    validFrom: new Date(payload.validFrom),
    validTo: payload.validTo === null ? null : new Date(payload.validTo),
  };
}

function toScope(scope: PriceScopePayload): PriceScope {
  return { type: scope.type, id: scope.id };
}
