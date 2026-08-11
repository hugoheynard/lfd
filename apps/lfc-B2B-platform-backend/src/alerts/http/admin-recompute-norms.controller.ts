import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../infra/auth/public.decorator.js";
import { RecomputeGuard } from "../../infra/auth/recompute.guard.js";
import { RecomputeProductNormsCommand } from "../application/commands/recompute-product-norms.command.js";

/**
 * Endpoint **batch** : recalcule la norme catalogue (médiane par produit).
 *
 * Déclenché par cron aux heures creuses, jamais en temps réel — la norme d'un
 * produit ne bouge pas d'une commande à l'autre. Retourne le nombre de produits
 * normés : sans ça, un cron qui ne trouve rien serait indiscernable d'un cron qui
 * ne tourne pas.
 */
@Controller("admin/recompute/product-norms")
@Public()
@UseGuards(RecomputeGuard)
export class AdminRecomputeNormsController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  async recompute(): Promise<{ recomputed: number }> {
    const recomputed = await this.commands.execute<RecomputeProductNormsCommand, number>(
      new RecomputeProductNormsCommand(NORM_WINDOW_DAYS),
    );
    return { recomputed };
  }
}

/**
 * La fenêtre du recalcul, alignée sur le défaut du type `quantity_outlier`.
 *
 * Une seule projection sert toutes les règles : la calculer par fenêtre demandée
 * multiplierait le coût sans rien apporter tant qu'un seul réglage existe. Le
 * jour où deux comptes veulent deux fenêtres, c'est ici que ça se saura.
 */
const NORM_WINDOW_DAYS = 180;
