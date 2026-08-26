import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { SalesContextRegistry } from "../domain/ports/sales-context.registry.js";
import type { SalesContext } from "../domain/value-objects/sales-context.js";
import { bootstrapRootContext } from "../domain/value-objects/bootstrap-contexts.js";

interface SalesContextRow {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly handleSuffix: string;
  readonly active: boolean;
  readonly shopifyProjected: boolean;
  readonly position: number;
}

/**
 * **Aucun filtre.** Une ligne du registre est un contexte, point.
 *
 * Il y en avait un, et c'était LE verrou : le code portait la liste des trois
 * canaux connus (`emporter`, `surPlace`, `b2b`) et écartait en silence toute
 * ligne qui n'en citait aucun. La promesse de C0 — « ajouter un contexte de
 * vente est une ligne, zéro code » — était donc fausse : une quatrième ligne
 * n'apparaissait nulle part, sans erreur ni log, et l'écran comme la
 * facturation l'ignoraient.
 *
 * Le filtre existait pour une bonne raison — « lui prêter un canal par défaut
 * ferait facturer un contexte que personne ne peut vendre ». Elle a disparu
 * avec sa cause : la matrice ne demande plus à quel canal un contexte se
 * rattache, elle cite son nom.
 */
function toContext(row: SalesContextRow): SalesContext {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    handleSuffix: row.handleSuffix,
    active: row.active,
    shopifyProjected: row.shopifyProjected,
    position: row.position,
  };
}

@Injectable()
export class PrismaSalesContextRegistry extends SalesContextRegistry {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async active(): Promise<readonly SalesContext[]> {
    return this.read({ active: true });
  }

  async all(): Promise<readonly SalesContext[]> {
    return this.read({});
  }

  /**
   * Sème le contexte racine s'il manque. **Idempotent** : deux boots
   * simultanés ne peuvent pas en créer deux, `key` étant unique — le second
   * ne fait rien plutôt que d'échouer.
   *
   * `update: {}` et non un `update` qui réécrirait les colonnes : la racine est
   * ineffaçable, pas immuable. Son libellé, sa position et son état de service
   * restent réglables, et le boot n'a pas à les repousser à leur valeur d'usine
   * toutes les nuits.
   */
  async ensureRootContext(): Promise<void> {
    const root = bootstrapRootContext();
    await this.prisma.salesContext.upsert({
      where: { key: root.key },
      update: {},
      create: { id: `ctx_${root.key}`, ...root },
    });
  }

  /**
   * Compté en base, sur `point_of_sale_context`.
   *
   * ⚠️ Pas sur `location_context`, et ce n'est pas un détail : depuis p-0, la
   * plateforme professionnelle offre le contexte racine, et elle n'a pas de
   * ligne dans `location_context` — qui ne connaît que les emplacements. L'écran
   * aurait donc annoncé « offert par 0 point de vente » pour le B2B, puis
   * refusé sa suppression sur une clé étrangère. Dire vert et faire rouge est
   * précisément ce qu'on cherche à ne jamais faire.
   *
   * Les deux tables sont tenues dans la même transaction le temps de la
   * bascule ; la nouvelle est un SUR-ensemble de l'ancienne, donc la lire
   * n'anticipe rien — elle corrige un trou.
   */
  async offeredByLocations(): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.pointOfSaleContext.groupBy({
      by: ["contextKey"],
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.contextKey, row._count._all]));
  }

  private async read(where: { active?: boolean }): Promise<readonly SalesContext[]> {
    const rows = await this.prisma.salesContext.findMany({
      where,
      orderBy: { position: "asc" },
    });
    return rows.map(toContext);
  }
}
