import { Controller, HttpCode, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { DetachProductVariantCommand } from "../application/detach-product-variant.js";
import { DiscontinueProductVariantCommand } from "../application/discontinue-product-variant.js";
import { MakeVariantDefaultCommand } from "../application/make-variant-default.js";
import { RestoreProductVariantCommand } from "../application/restore-product-variant.js";

/**
 * **Les gestes qui sortent une déclinaison de sa fiche, ou l'y ramènent**
 * (`plan-gestes-de-declinaison.md`, G1 et G2), et celui qui en fait le défaut (G4) — sous le même préfixe et le
 * même mur que les fiches, dans leur propre contrôleur : `ProductController`
 * dépasse déjà la taille d'un fichier.
 *
 * Des `POST` sans corps : ce sont des verbes, pas des états qu'on remplace,
 * et seul l'archivage se défait (`restore`) — jamais un détachement.
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/products")
export class ProductVariantLifecycleController {
  constructor(private readonly commands: CommandBus) {}

  /** Archive la déclinaison : hors vente, en base, référence jamais réattribuée. */
  @Post(":id/variants/:variantId/discontinue")
  @HttpCode(200)
  async discontinueVariant(@Param("id") id: string, @Param("variantId") variantId: string) {
    await this.commands.execute<DiscontinueProductVariantCommand, void>(
      new DiscontinueProductVariantCommand(id, variantId),
    );
    return { id, variantId };
  }

  /** La désarchive : son rang, sa référence, et la vente selon la fiche. */
  @Post(":id/variants/:variantId/restore")
  @HttpCode(200)
  async restoreVariant(@Param("id") id: string, @Param("variantId") variantId: string) {
    await this.commands.execute<RestoreProductVariantCommand, void>(
      new RestoreProductVariantCommand(id, variantId),
    );
    return { id, variantId };
  }

  /** En fait la déclinaison par défaut : celles qui suivaient le défaut la suivent. */
  @Post(":id/variants/:variantId/make-default")
  @HttpCode(200)
  async makeVariantDefault(@Param("id") id: string, @Param("variantId") variantId: string) {
    await this.commands.execute<MakeVariantDefaultCommand, void>(
      new MakeVariantDefaultCommand(id, variantId),
    );
    return { id, variantId };
  }

  /** En fait un produit, né inactif ; rend l'id du nouveau produit, que l'écran ouvre. */
  @Post(":id/variants/:variantId/detach")
  async detachVariant(@Param("id") id: string, @Param("variantId") variantId: string) {
    const productId = await this.commands.execute<DetachProductVariantCommand, string>(
      new DetachProductVariantCommand(id, variantId),
    );
    return { id: productId };
  }
}
