import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { CorruptedPriceRuleError } from "../domain/pricing-errors.js";
import { PriceRuleReader } from "../domain/ports/price-rule.reader.js";
import {
  PRICE_STAGES,
  type PriceAlteration,
  type PriceRule,
  type PricingContext,
} from "../domain/price-rule.js";

/** La ligne telle que Prisma la rend — discriminants en `String`, donc à vérifier. */
interface RuleRow {
  readonly id: string;
  readonly stage: string;
  readonly nature: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly audienceType: string;
  readonly audienceId: string | null;
  readonly minQuantity: number | null;
  readonly amountCents: number | null;
  readonly direction: string | null;
  readonly mode: string | null;
  readonly value: number | null;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly label: string;
}

const SCOPE_TYPES = ["global", "category", "product", "variant"] as const;
const AUDIENCE_TYPES = ["all", "segment", "company"] as const;

@Injectable()
export class PrismaPriceRuleReader extends PriceRuleReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Élague sur ce que SQL sait faire — fenêtre, portée, audience — et laisse la
   * spécificité au domaine.
   *
   * Le palier de quantité n'est **pas** filtré ici alors qu'il pourrait l'être :
   * la fonction pure le fait, et deux endroits qui filtrent la même chose sont
   * deux endroits à corriger le jour où la règle change.
   */
  async candidatesFor(context: PricingContext): Promise<PriceRule[]> {
    const rows = await this.prisma.priceRule.findMany({
      where: {
        validFrom: { lte: context.at },
        OR: [{ validTo: null }, { validTo: { gt: context.at } }],
        AND: [
          {
            OR: [
              { scopeType: "global" },
              { scopeType: "category", scopeId: context.categoryId },
              { scopeType: "product", scopeId: context.productSku },
              { scopeType: "variant", scopeId: context.variantSku },
            ],
          },
          { OR: audienceFilter(context) },
        ],
      },
    });
    return rows.map(toDomain);
  }
}

/**
 * Une commande **sans entreprise** (parcours zéro friction) ne prend que les
 * règles ouvertes à tous. Construire le filtre plutôt que d'écrire trois `OR`
 * inconditionnels évite de demander à Postgres `audience_id = NULL`, qui ne
 * correspond jamais et ferait passer la règle pour absente au lieu d'inapplicable.
 */
function audienceFilter(context: PricingContext): { audienceType: string; audienceId?: string }[] {
  const clauses: { audienceType: string; audienceId?: string }[] = [{ audienceType: "all" }];
  if (context.segmentId !== null) {
    clauses.push({ audienceType: "segment", audienceId: context.segmentId });
  }
  if (context.companyId !== null) {
    clauses.push({ audienceType: "company", audienceId: context.companyId });
  }
  return clauses;
}

/**
 * Ligne → règle de domaine.
 *
 * Les discriminants sont des `String` en base : une valeur inattendue **lève**
 * plutôt que de se propager. Une règle illisible qui passerait en silence
 * facturerait un prix que personne n'a décidé — c'est le seul cas où planter
 * vaut mieux que continuer.
 */
function toDomain(row: RuleRow): PriceRule {
  const stage = expect(row.id, "stage", row.stage, PRICE_STAGES);
  const scopeType = expect(row.id, "scopeType", row.scopeType, SCOPE_TYPES);
  const audienceType = expect(row.id, "audienceType", row.audienceType, AUDIENCE_TYPES);

  const common = {
    id: row.id,
    stage: stage,
    scope: { type: scopeType, id: row.scopeId },
    audience: { type: audienceType, id: row.audienceId },
    minQuantity: row.minQuantity,
    validFrom: row.validFrom,
    validTo: row.validTo,
    label: row.label,
  } as const;

  if (row.nature === "replace") {
    if (row.amountCents === null) {
      throw new CorruptedPriceRuleError(row.id, "amountCents manquant sur une règle « replace »");
    }
    return { ...common, nature: "replace", amountCents: row.amountCents };
  }
  if (row.nature === "alter") {
    return { ...common, nature: "alter", alteration: alterationOf(row) };
  }
  throw new CorruptedPriceRuleError(row.id, `nature inconnue « ${row.nature} »`);
}

function alterationOf(row: RuleRow): PriceAlteration {
  if (row.value === null || (row.direction !== "increase" && row.direction !== "decrease")) {
    throw new CorruptedPriceRuleError(row.id, "sens ou grandeur manquants sur une règle « alter »");
  }
  if (row.mode === "percent") {
    return { direction: row.direction, mode: "percent", bp: row.value };
  }
  if (row.mode === "amount") {
    return { direction: row.direction, mode: "amount", cents: row.value };
  }
  throw new CorruptedPriceRuleError(row.id, `unité inconnue « ${String(row.mode)} »`);
}

/** Vérifie qu'une chaîne de la base appartient bien à l'union du domaine. */
function expect<T extends string>(
  ruleId: string,
  field: string,
  value: string,
  allowed: readonly T[],
): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new CorruptedPriceRuleError(ruleId, `${field} : valeur inattendue « ${value} »`);
  }
  return match;
}
