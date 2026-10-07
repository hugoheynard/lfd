import { CommandBus } from "@nestjs/cqrs";

import { SetFeatureOverrideCommand } from "../src/b2b/feature-access/application/commands/set-feature-override.command.js";
import type { E2eContext } from "./e2e-harness.js";

/**
 * **Ouvre la livraison aux particuliers** (`publicDelivery`), fermée par
 * défaut — par la vraie commande, comme l'écran Accès aux fonctions.
 *
 * Depuis le 2026-10-07, `POST /orders` refuse une livraison à un particulier
 * connecté tant que la clé est fermée (audit livraisons, § 3.3). Les scènes
 * qui font livrer une commande personnelle l'ouvrent donc après chaque remise
 * à zéro : c'est l'état d'une maison qui livre les particuliers.
 */
export async function openPublicDelivery(ctx: E2eContext): Promise<void> {
  await ctx.app
    .get(CommandBus)
    .execute(new SetFeatureOverrideCommand("publicDelivery", "open", "staff_e2e_scene"));
}
