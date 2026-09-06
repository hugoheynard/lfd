import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { inForceFor } from "../domain/specificity.js";
import { PRICING_CACHE_KEYS, PricingMaterialsCache } from "./pricing-materials.cache.js";
import { PriceRuleReader } from "../domain/ports/price-rule.reader.js";
import { unarchivedAt } from "./archived-at.js";
import { ruleFromRow } from "./price-rows.js";
import type { PriceRule } from "../domain/price-rule.js";
import type { PricingScopes } from "../domain/pricing-scopes.js";

@Injectable()
export class PrismaPriceRuleReader extends PriceRuleReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PricingMaterialsCache,
  ) {
    super();
  }

  /**
   * Élague sur ce que SQL sait faire — fenêtre, portée, audience — et laisse la
   * spécificité au domaine.
   *
   * Le palier de quantité n'est **pas** filtré ici alors qu'il pourrait l'être :
   * la fonction pure le fait, et deux endroits qui filtrent la même chose sont
   * deux endroits à corriger le jour où la règle change.
   *
   * 🔴 **Une lecture pour tout le panier.** La fenêtre et l'audience sont gelées
   * pour l'appel ; seule la portée varie d'un article à l'autre, et c'est une
   * égalité — donc un `IN`. Un `in: []` ne correspond à rien, ce qui est
   * exactement ce qu'on veut d'un panier qui ne vise aucune famille.
   */
  async inScopes(scopes: PricingScopes): Promise<PriceRule[]> {
    // 🔴 **La table entière, gardée en mémoire, puis triée ici.**
    //
    // Les règles changent quelques fois par semaine et se relisaient à chaque
    // devis. Ce qui est gardé n'est pas la RÉPONSE — elle dépend de l'instant et
    // du client, donc une clé neuve à presque chaque appel — mais la table. Le
    // tri par fenêtre et par audience reste par requête, sur une liste déjà
    // chargée : c'est une comparaison d'identifiants, pas une lecture.
    //
    // L'élagage par PORTÉE n'est plus fait : il servait à ne pas transporter
    // des lignes depuis Postgres, et il n'y a plus de fil. La portée est de
    // toute façon rejugée par l'index de `pricing-materials.ts`, dont
    // l'équivalence à `matchesScope` est éprouvée. Le refaire ici serait la
    // seconde vérité que `archived-at.ts` interdit.
    const all = await this.cache.of(PRICING_CACHE_KEYS.rules, () => this.unarchived());
    return inForceFor(all, scopes);
  }

  /** Toutes les règles vivantes — l'unique lecture que le cache retient. */
  private async unarchived(): Promise<PriceRule[]> {
    const rows = await this.prisma.priceRule.findMany({ where: { archivedAt: null } });
    return rows.map(ruleFromRow);
  }

  /**
   * Tout ce qui est posé, expiré et suspendu compris — l'écran doit pouvoir le
   * rouvrir. Les **archivées**, non : ranger sert précisément à ne plus les voir,
   * et leur histoire reste lisible dans le journal.
   *
   * « Archivée » se lit **à l'instant demandé** : cf. {@link unarchivedAt}.
   */
  async listAll(at: Date): Promise<PriceRule[]> {
    const rows = await this.prisma.priceRule.findMany({
      where: unarchivedAt(at),
      orderBy: [{ stage: "asc" }, { validFrom: "asc" }],
    });
    return rows.map(ruleFromRow);
  }

  async listArchived(limit: number): Promise<PriceRule[]> {
    const rows = await this.prisma.priceRule.findMany({
      where: { archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
      take: limit,
    });
    return rows.map(ruleFromRow);
  }
}
