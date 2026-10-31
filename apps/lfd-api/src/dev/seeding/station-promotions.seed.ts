import type { CartAdjustment } from "@lfd/contracts";
import type { CommandBus } from "@nestjs/cqrs";

import { PosePromotionCommand } from "../../b2b/promotions/application/commands/pose-promotion.command.js";
import type { PromotionAudience } from "../../b2b/promotions/domain/promotion-audience.js";
import { PromotionAudienceSet } from "../../b2b/promotions/domain/promotion-audience-set.js";
import type { PromotionEffect } from "../../b2b/promotions/domain/promotion-effect.js";

/**
 * L'auteur des promotions semées : un acteur système nommé, comme la reprise
 * (`created_by` admet « l'id d'une fiche staff, ou un acteur système nommé »).
 * La ligne de commande n'a pas de fiche staff à citer.
 */
const SEED_ACTOR = "system:dev-seed";

/**
 * **La remise d'un point, posée en promotions** (plan des promotions, L12).
 *
 * Depuis L12, la fiche d'un site refuse une remise (`refuseLegacyPromotionEditor`) :
 * le semis la posait par `CreatePickupAddressCommand` et le rechargement de
 * dev mourait en 409. Elle se pose désormais comme la reprise (§ 13.4)
 * l'écrivait : « pros actifs » et « tous sauf les pros actifs », retrait à CE
 * point, sur tout — par le vrai geste, celui de l'écran Promotions.
 */
export async function posePointDiscount(
  commands: CommandBus,
  pickupId: string,
  adjustment: CartAdjustment,
  now: Date,
): Promise<void> {
  const audiences: readonly PromotionAudience[] = [
    { kind: "pros_active" },
    { kind: "everyone_but_active_pros" },
  ];
  for (const audience of audiences) {
    await commands.execute(
      new PosePromotionCommand(
        {
          internalName: `Remise de retrait · ${audience.kind}`,
          description: null,
          label: { fr: "Remise de retrait", en: null, it: null },
          audienceLabels: { individuals: null, pros: null },
          reason: null,
          effect: effectOf(adjustment),
          ownFloor: null,
          stacksOverMercuriale: false,
          cumulative: false,
          validFrom: now,
          validTo: null,
          audiences: PromotionAudienceSet.of([audience]),
          fulfillment: { kind: "basket", pickup: { points: [pickupId] }, delivery: "none" },
          scope: { mode: "all_except", rules: [] },
          conditions: [],
        },
        SEED_ACTOR,
      ),
    );
  }
}

function effectOf(adjustment: CartAdjustment): PromotionEffect {
  return adjustment.mode === "percent"
    ? { kind: "percent_off", basisPoints: adjustment.bp }
    : { kind: "basket_amount_off", cents: adjustment.cents };
}
