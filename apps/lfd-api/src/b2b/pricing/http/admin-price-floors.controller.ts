import {
  pricingReasonPayloadSchema,
  setPriceFloorPayloadSchema,
  type PriceScopePayload,
  type PricingReasonPayload,
  type SetPriceFloorPayload,
} from "@lfd/contracts";
import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffSub } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  ArchivePriceFloorCommand,
  ConfirmPriceFloorCommand,
  SetPriceFloorCommand,
} from "../application/commands/pricing.commands.js";
import { UnknownPriceScopeError } from "../domain/pricing-errors.js";
import type { PriceFloorPolicy } from "../domain/floor-policy.js";
import type { PriceFloor, PriceScope } from "../domain/price-rule.js";

/**
 * **Les limites** — ce qui empêche l'empilement des étages de descendre trop bas.
 *
 * Séparé des règles, et pas seulement par volume : une limite n'a ni étage, ni
 * audience, ni fenêtre. Elle n'est pas une couche de prix, c'est ce qui les
 * arbitre — et ses trois gestes (poser, confirmer, archiver) ne ressemblent à
 * aucun de ceux d'une règle.
 *
 * Une limite se désigne par sa **portée** et jamais par un identifiant : c'est ce
 * que l'écran connaît, et l'identifiant en dérive de toute façon.
 */
@Controller("admin/pricing")
@AdminSurface("b2b_pricing")
export class AdminPriceFloorsController {
  constructor(private readonly commands: CommandBus) {}

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
   * **Confirmer** une limite sans la changer : l'intention est maintenue, sa
   * référence et sa date repartent d'aujourd'hui.
   *
   * `POST` et non `PUT` : ce n'est pas une écriture idempotente de valeur, c'est
   * un acte daté — « j'ai regardé l'écart, et je maintiens ». Le rejouer
   * n'écrase rien, il redate.
   */
  @Post("floors/global/confirm")
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmGlobalFloor(@StaffSub() staffSub: string): Promise<void> {
    await this.confirmFloorOn({ type: "global", id: null }, staffSub);
  }

  @Post("floors/:scopeType/:scopeId/confirm")
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmFloor(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.confirmFloorOn({ type: parseScopeType(scopeType), id: scopeId }, staffSub);
  }

  private async confirmFloorOn(scope: PriceScopePayload, staffSub: string): Promise<void> {
    await this.commands.execute<ConfirmPriceFloorCommand, void>(
      new ConfirmPriceFloorCommand(toScope(scope), staffSub),
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
  /**
   * **Archiver** une limite, avec le motif que l'écran a demandé.
   *
   * Doublon apparent du `DELETE` d'à côté, et pourtant nécessaire : un `DELETE`
   * ne porte pas de corps de façon fiable à travers les intermédiaires HTTP, et
   * le motif est précisément ce qu'on veut garder. Le `DELETE` reste, sans
   * motif, pour l'appelant qui n'en a pas.
   */
  @Post("floors/global/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveGlobalFloor(
    @Body(new ZodBody(pricingReasonPayloadSchema)) payload: PricingReasonPayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.archiveFloorOn({ type: "global", id: null }, staffSub, payload.reason);
  }

  @Post("floors/:scopeType/:scopeId/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveScopedFloor(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Body(new ZodBody(pricingReasonPayloadSchema)) payload: PricingReasonPayload,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.archiveFloorOn(
      { type: parseScopeType(scopeType), id: scopeId },
      staffSub,
      payload.reason,
    );
  }

  @Delete("floors/global")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeGlobalFloor(@StaffSub() staffSub: string): Promise<void> {
    await this.archiveFloorOn({ type: "global", id: null }, staffSub);
  }

  @Delete("floors/:scopeType/:scopeId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFloor(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.archiveFloorOn({ type: parseScopeType(scopeType), id: scopeId }, staffSub);
  }

  /** Retirer une limite l'**archive** : rien ne s'efface, ici non plus. */
  private async archiveFloorOn(
    scope: PriceScopePayload,
    staffSub: string,
    reason: string | null = null,
  ): Promise<void> {
    await this.commands.execute<ArchivePriceFloorCommand, void>(
      new ArchivePriceFloorCommand(toScope(scope), staffSub, reason),
    );
  }
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
