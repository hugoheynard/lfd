import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PricingDecisionsReader,
  type LoadedDecisions,
  type LoadedFloor,
  type LoadedRule,
} from "../application/ports/pricing-decisions.reader.js";
import { referenceCanonicalFor, type ReferenceArticle } from "../application/floor-reference.js";
import { unarchivedAt } from "./archived-at.js";
import { floorFromRow, floorViewFromRow, ruleFromRow, ruleViewFromRow } from "./price-rows.js";

/**
 * **La lecture d'écran, écrite une fois.**
 *
 * Les deux écrans de tarification — le tableau général et l'onglet Tarifs d'une
 * fiche compte — lisaient ces deux tables chacun de son côté. Ce qui les
 * séparait n'était pas une intention mais une omission, et elle a coûté :
 * la fiche client n'avait pas la fenêtre de validité des planchers.
 */
@Injectable()
export class PrismaPricingDecisionsReader extends PricingDecisionsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async decisionsAt(
    at: Date,
    audience: { readonly companyId: string | null },
    articles: readonly ReferenceArticle[],
  ): Promise<LoadedDecisions> {
    const [ruleRows, floorRows] = await Promise.all([
      this.prisma.priceRule.findMany({
        // **Les archivées n'entrent pas** : ranger sert précisément à ne plus les
        // voir. « Archivée » se lit à l'instant demandé — cf. `unarchivedAt`.
        //
        // Rien d'autre n'est filtré, et c'est le sujet de ce port : hors
        // fenêtre, suspendue, hors audience restent VISIBLES, avec leur statut.
        // C'est ce qu'un écran de paramétrage montre.
        where: { AND: [unarchivedAt(at), audienceClause(audience.companyId)] },
        orderBy: [{ stage: "asc" }, { validFrom: "asc" }],
      }),
      // 🔴 **La fenêtre, en plus du rangement.** Depuis que la limite est
      // versionnée (R17), une portée porte N lignes — une par période — et les
      // deux écrans n'en montrent qu'une, par un `find` sur la portée. Sans ce
      // filtre, c'est la PREMIÈRE venue : la limite d'avant une re-pose, avec
      // son signal de dérive rallumé sur une limite qu'on venait de revoir.
      this.prisma.priceFloor.findMany({
        where: {
          AND: [
            unarchivedAt(at),
            { validFrom: { lte: at } },
            { OR: [{ validTo: null }, { validTo: { gt: at } }] },
          ],
        },
      }),
    ]);

    const rules: LoadedRule[] = ruleRows.map((row) => ({
      rule: ruleFromRow(row),
      view: ruleViewFromRow(row),
    }));
    const floors: LoadedFloor[] = floorRows.map((row) => {
      const floor = floorFromRow(row);
      return {
        floor,
        view: floorViewFromRow(row, referenceCanonicalFor(floor.scope, articles), at),
      };
    });
    return { rules, floors };
  }
}

/**
 * Les règles qu'un client peut se voir appliquer : les siennes, et celles de tous.
 *
 * 🔴 **Le filtre est dans la REQUÊTE**, et il y reste. Une règle d'un tiers qui
 * entrerait dans le matériau pourrait gagner son étage, et le prix rendu serait
 * celui d'un autre client. `applies()` l'écarterait à la résolution — mais c'est
 * une garantie surveillée là où celle-ci est structurelle, et `CLAUDE.md` range
 * « refusé en base » au-dessus de « refusé par le calcul ».
 *
 * `segment` est volontairement absent : aucune société ne porte de segment
 * aujourd'hui (cf. `pricing-context.ts`), donc une règle de segment ne peut
 * viser personne. L'inclure ferait apparaître dans le dossier d'un client des
 * règles dont on sait qu'elles ne s'appliqueront pas à lui.
 *
 * `null` — le tableau général — ne filtre RIEN : il montre ce qui joue sur un
 * prix, tarifs négociés d'autres comptes compris.
 */
function audienceClause(companyId: string | null): {
  OR?: [{ audienceType: "all" }, { audienceType: "company"; audienceId: string }];
} {
  return companyId === null
    ? {}
    : { OR: [{ audienceType: "all" }, { audienceType: "company", audienceId: companyId }] };
}
