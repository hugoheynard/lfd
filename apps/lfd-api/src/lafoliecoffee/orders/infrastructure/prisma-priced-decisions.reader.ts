import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PricedDecisionsReader } from "../../pricing/domain/ports/priced-decisions.reader.js";

/**
 * **A-t-elle facturé ?** — lu dans la trace figée des lignes de commande.
 *
 * L'adaptateur vit dans `orders` parce que la réponse y vit : c'est la ligne de
 * commande qui garde, gelée avec son prix, la liste des décisions qui l'ont
 * produit. Le port, lui, est déclaré par `pricing`, qui a besoin du fait sans
 * avoir le droit de lire ces tables.
 *
 * ## Deux colonnes, parce qu'un engagement n'est pas un étage
 *
 * `pricing_steps` porte les décisions qui ont **modifié le prix** — règle,
 * barème (via `ladderAsRule`), mercuriale —, chacune sous son `ruleId`.
 * `pricing_commitment` porte l'engagement séparément, sous `commitmentId` : il
 * ne modifie pas le prix, il **mesure** ce qui ouvre le palier. Chercher un
 * engagement dans les étages ne rendrait donc jamais rien, et le refus qu'on
 * bâtit dessus serait silencieusement inopérant.
 *
 * ## Le coût, dit franchement
 *
 * `@>` sur du `jsonb` sans index est un parcours complet des lignes de commande.
 * L'index GIN posé avec ce lecteur le rend logarithmique — et il est **partiel**
 * sur `pricing_steps IS NOT NULL`, parce qu'une ligne sans trace ne répondra
 * jamais oui.
 *
 * La question ne se pose de toute façon **jamais sur le chemin qui facture** :
 * elle sert à refuser une pose, c'est-à-dire un geste de staff, quelques fois
 * par jour.
 */
@Injectable()
export class PrismaPricedDecisionsReader extends PricedDecisionsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hasPriced(decisionId: string): Promise<boolean> {
    return this.anyPriced([decisionId]);
  }

  /**
   * Une seule lecture pour toutes les décisions demandées.
   *
   * `findFirst` et non `count` : on demande « en existe-t-il une », pas
   * « combien ». Compter des milliers de lignes pour apprendre qu.il y en a
   * au moins une serait payer le pire cas à chaque pose.
   */
  override async anyPriced(decisionIds: readonly string[]): Promise<boolean> {
    if (decisionIds.length === 0) {
      return false;
    }
    const found = await this.prisma.orderLine.findFirst({
      where: {
        OR: [
          ...decisionIds.map((id) => ({
            pricingSteps: { array_contains: [{ ruleId: id }] },
          })),
          ...decisionIds.map((id) => ({
            pricingCommitment: { equals: { commitmentId: id } },
          })),
        ],
      },
      select: { id: true },
    });
    return found !== null;
  }
}
