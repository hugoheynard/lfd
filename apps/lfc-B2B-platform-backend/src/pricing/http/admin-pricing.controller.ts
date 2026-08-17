import {
  createPriceRulePayloadSchema,
  setPriceFloorPayloadSchema,
  type CreatePriceRulePayload,
  type PriceScopePayload,
  type SetPriceFloorPayload,
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
  CreatePriceRuleCommand,
  RemovePriceFloorCommand,
  RemovePriceRuleCommand,
  SetPriceFloorCommand,
} from "../application/commands/pricing.commands.js";
import { PricingBoardReader } from "../domain/ports/pricing-board.reader.js";
import { UnknownPriceScopeError } from "../domain/pricing-errors.js";
import type { PricingBoardView } from "@lfd/contracts";
import type { PricingRuleDraft } from "../domain/entities/pricing-rule.js";
import type { PriceFloorPolicy } from "../domain/floor-policy.js";
import type { PriceFloor, PriceScope } from "../domain/price-rule.js";

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

  /** Rend l'identifiant posé : l'écran en a besoin pour cibler la suppression. */
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

  @Delete("rules/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRule(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RemovePriceRuleCommand, void>(new RemovePriceRuleCommand(id));
  }

  @Put("floors")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setFloor(
    @Body(new ZodBody(setPriceFloorPayloadSchema)) payload: SetPriceFloorPayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<SetPriceFloorCommand, void>(
      new SetPriceFloorCommand(toScope(payload.scope), toPolicy(payload), staffSub),
    );
  }

  /**
   * La limite **globale** — elle ne désigne aucune cible, donc son chemin n'en
   * porte pas.
   *
   * Deux routes plutôt qu'une avec un segment vide : `DELETE .../floors/global/`
   * ne s'apparie tout simplement pas, un segment vide n'étant pas un segment.
   * Le premier essai l'avait supposé et rendait un 404 qui accusait la donnée
   * alors que c'était le routage.
   */
  @Delete("floors/global")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeGlobalFloor(): Promise<void> {
    await this.removeFloorOn({ type: "global", id: null });
  }

  @Delete("floors/:scopeType/:scopeId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFloor(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
  ): Promise<void> {
    await this.removeFloorOn({ type: parseScopeType(scopeType), id: scopeId });
  }

  private async removeFloorOn(scope: PriceScopePayload): Promise<void> {
    await this.commands.execute<RemovePriceFloorCommand, void>(
      new RemovePriceFloorCommand(toScope(scope)),
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

/**
 * Payload → politique de plancher : le **mur**, et la **porte** s'il y en a une.
 *
 * Les conditions d'ouverture traversent telles quelles ; c'est l'agrégat qui
 * refuse une porte sans clé, ou une porte au-dessus du mur.
 */
function toPolicy(payload: SetPriceFloorPayload): PriceFloorPolicy {
  const dynamic = payload.dynamic;
  return {
    hard: toFloor(payload.mode, payload.value),
    dynamic:
      dynamic === null
        ? null
        : { floor: toFloor(dynamic.mode, dynamic.value), unlock: dynamic.unlock },
  };
}

function toFloor(mode: "percent" | "amount", value: number): PriceFloor {
  return mode === "percent" ? { mode: "percent", bp: value } : { mode: "amount", cents: value };
}

const SCOPE_TYPES = ["global", "category", "product", "variant"] as const;

/**
 * Le segment de chemin est une chaîne libre : le valider ici évite qu'une portée
 * inventée descende jusqu'au domaine, où elle ne correspondrait à rien et
 * ressortirait en « aucune limite posée » — un 404 qui mentirait sur la cause.
 */
function parseScopeType(value: string): (typeof SCOPE_TYPES)[number] {
  const match = SCOPE_TYPES.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new UnknownPriceScopeError(value);
  }
  return match;
}
