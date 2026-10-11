import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { ApplyShopCopyRenames } from "../application/apply-shop-copy-renames.js";
import { embeddedShopCopyRenames } from "./embedded-shop-copy.js";

/**
 * Reporte les renommages de clés au démarrage (§10) : un remplacement publié
 * sous une ancienne clé suit le texte qu'il remplace.
 *
 * Un échec ne fait pas tomber l'API : les remplacements non reportés restent
 * orphelins — montrés à l'éditeur, jamais appliqués —, et la boutique sert le
 * texte du code. On le dit dans les journaux, au démarrage suivant on réessaie.
 */
@Injectable()
export class ShopCopyRenamesOnBoot implements OnApplicationBootstrap {
  private readonly logger = new Logger(ShopCopyRenamesOnBoot.name);

  constructor(private readonly renames: ApplyShopCopyRenames) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const moved = await this.renames.apply(embeddedShopCopyRenames());
      if (moved > 0) {
        this.logger.log(`${moved} texte(s) de la boutique reporté(s) vers leur nouvelle clé.`);
      }
    } catch (error: unknown) {
      this.logger.error(
        `Les renommages des textes de la boutique n'ont pas pu être reportés ; les remplacements concernés restent orphelins jusqu'au prochain démarrage : ${String(error)}`,
      );
    }
  }
}
