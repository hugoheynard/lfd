import { Injectable } from "@nestjs/common";

import {
  fromAdjustmentColumns,
  toAdjustmentColumns,
} from "../../pricing/cart-adjustment.mapper.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderLateFeeReader,
  type LateFeeSetting,
} from "../../orders/domain/ports/order-late-fee.reader.js";
import { OrderLateFeeRepository } from "../domain/order-late-fee.repository.js";

/**
 * La clé unique de la ligne de réglage. Le `CHECK` de la migration l'impose ;
 * l'écrire ici en dur est la même vérité, pas une seconde source.
 */
const SINGLETON = "singleton";

@Injectable()
export class PrismaOrderLateFeeRepository extends OrderLateFeeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(): Promise<LateFeeSetting | null> {
    const row = await this.prisma.orderLateFee.findUnique({ where: { id: SINGLETON } });
    if (row === null) {
      return null;
    }
    // Le MÊME mapper que la remise de retrait et le frais de zone : ces trois
    // ajustements se lisent d'une seule façon, sinon ils finiraient par
    // interpréter `value` différemment.
    const adjustment = fromAdjustmentColumns(row.mode, row.value);
    if (adjustment === null) {
      return null;
    }
    return {
      adjustment,
      // `Decimal` → `number` : le domaine ne connaît pas le type de l'ORM.
      vatRatePercent: row.vatRatePercent.toNumber(),
    };
  }

  async save(setting: LateFeeSetting, updatedBy: string): Promise<void> {
    const columns = toAdjustmentColumns(setting.adjustment);
    if (columns.mode === null || columns.value === null) {
      // Inatteignable : le schéma d'entrée exige l'ajustement. La branche existe
      // pour que le type le dise, pas pour être prise.
      return;
    }
    const data = {
      mode: columns.mode,
      value: columns.value,
      vatRatePercent: setting.vatRatePercent,
      updatedBy,
    };
    await this.prisma.orderLateFee.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, ...data },
      update: data,
    });
  }

  /**
   * `deleteMany` et non `delete` : retirer un réglage déjà absent n'est pas une
   * erreur, c'est le résultat voulu. Un `delete` lèverait sur zéro ligne et
   * transformerait une idempotence en 404.
   */
  async clear(): Promise<void> {
    await this.prisma.orderLateFee.deleteMany({ where: { id: SINGLETON } });
  }
}

/**
 * Le même adaptateur, vu par la **passation** : elle ne lit que le réglage
 * courant. `useExisting` sur le repository — une seule instance, une seule
 * lecture de la table.
 */
@Injectable()
export class PrismaOrderLateFeeReader extends OrderLateFeeReader {
  constructor(private readonly repository: OrderLateFeeRepository) {
    super();
  }

  async current(): Promise<LateFeeSetting | null> {
    return this.repository.read();
  }
}
