import {
  createPriceRulePayloadSchema,
  pricingReasonPayloadSchema,
  setVolumeLadderPayloadSchema,
  type CreatePriceRulePayload,
  type PricingReasonPayload,
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
  Post,
  Put,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../infra/auth/admin-surface.decorator.js";
import { StaffSub } from "../../infra/auth/staff.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import {
  ArchivePriceRuleCommand,
  CreatePriceRuleCommand,
  PausePriceRuleCommand,
  ResumePriceRuleCommand,
  SetVolumeLadderCommand,
} from "../application/commands/pricing.commands.js";
import { PricingBoardReader } from "../domain/ports/pricing-board.reader.js";
import type { PriceRuleView, PriceScopePayload, PricingBoardView } from "@lfd/contracts";
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
    private readonly commands: CommandBus,
  ) {}

  /** Le tableau complet — familles, articles, règles, limites, prix résolus. */
  @Get()
  read(): Promise<PricingBoardView> {
    return this.board.read();
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

  /** Rend l'identifiant posé : l'écran en a besoin pour cibler ses gestes. */
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
    validFrom: new Date(payload.validFrom),
    validTo: payload.validTo === null ? null : new Date(payload.validTo),
  };
}

function toScope(scope: PriceScopePayload): PriceScope {
  return { type: scope.type, id: scope.id };
}
