import { Controller, Delete, HttpCode, HttpStatus, Param } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { DeleteProductCommand } from "../application/delete-product.js";
import { Idempotent } from "../../../../platform/shared/http/idempotent.decorator.js";

/**
 * **Supprimer une fiche archivée** (`documentation/pim/plan-effacer-une-fiche-archivee.md`,
 * v4) — sous le même préfixe et le même mur que les fiches, dans son propre
 * contrôleur : `ProductController` dépasse déjà la taille d'un fichier.
 *
 * `DELETE` demande `pim_catalog:write` (le verbe l'implique) : la suppression
 * se rattrape par le journal, elle ne demande pas un droit à part.
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/products")
export class ProductDeletionController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * Un soft delete : la fiche passe `deleted` et disparaît de toute lecture du
   * référentiel. Refusée (409) hors archivée ; 404 sur une fiche inconnue.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "seule une fiche archivée se supprime : rejouée, la fiche est déjà supprimée et la demande est refusée (404) sans rien écrire",
  )
  async deleteProduct(@Param("id") id: string): Promise<void> {
    await this.commands.execute<DeleteProductCommand, void>(new DeleteProductCommand(id));
  }
}
