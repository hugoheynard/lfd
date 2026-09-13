import { Injectable } from "@nestjs/common";
import { PRO_PRICE_METHODS, type ProPriceMethod } from "@lfd/pim-contracts";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { AccountingRules } from "../domain/entities/accounting-rules.js";
import {
  AccountingRulesRepository,
  type AccountingRulesRecord,
} from "../domain/ports/accounting-rules.repository.js";

/**
 * L'identité du singleton. Une constante, comme `ShopifySettings` : c'est elle
 * qui garantit l'unicité, la clé primaire faisant le mur.
 */
const SINGLETON_ID = "accounting";

@Injectable()
export class PrismaAccountingRulesRepository extends AccountingRulesRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async read(): Promise<AccountingRulesRecord | null> {
    const row = await this.prisma.accountingRules.findUnique({ where: { id: SINGLETON_ID } });
    if (row === null) {
      return null;
    }
    return {
      rules: AccountingRules.reconstitute({
        proPriceRatioBp: row.proPriceRatioBp,
        // La colonne est une chaîne libre côté base (cf. son commentaire) : le
        // VO la juge à la reconstitution, comme le rapport. Une ligne écrite à
        // la main avec une méthode inconnue se signale ICI, plutôt que de
        // ressortir telle quelle et de tarifer le catalogue.
        proPriceMethod: methodOf(row.proPriceMethod),
        proPriceFixedVatPercent: row.proPriceFixedVatPercent,
      }),
      updatedAt: row.updatedAt,
    };
  }

  /**
   * `upsert` et non `update` : le premier réglage crée la ligne, et il ne doit
   * pas demander à l'appelant de savoir laquelle des deux écritures il fait.
   * L'absence de ligne est un état du modèle, pas un cas d'erreur.
   */
  async save(rules: AccountingRules): Promise<void> {
    const { proPriceRatioBp, proPriceMethod, proPriceFixedVatPercent } = rules.snapshot();
    const columns = { proPriceRatioBp, proPriceMethod, proPriceFixedVatPercent };
    await this.prisma.accountingRules.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...columns },
      update: columns,
    });
  }
}

/**
 * La chaîne de la base ramenée à l'union du contrat.
 *
 * Une valeur inconnue devient `ratio_ttc` — le calcul JUSTE — et non la méthode
 * de la plaquette : si un jour une ligne porte n'importe quoi, le repli doit
 * être celui qui ne facture personne sur une formule fausse. Le VO refuserait
 * de toute façon toute autre valeur ; ce repli sert à ce que le refus parle du
 * taux figé plutôt que d'un nom de méthode que personne ne reconnaîtrait.
 */
function methodOf(stored: string): ProPriceMethod {
  return PRO_PRICE_METHODS.includes(stored as ProPriceMethod)
    ? (stored as ProPriceMethod)
    : "ratio_ttc";
}
