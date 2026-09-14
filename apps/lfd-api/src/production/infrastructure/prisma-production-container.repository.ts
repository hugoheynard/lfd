import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionContainerReader } from "../domain/ports/production-container.reader.js";
import { ProductionContainerRepository } from "../domain/ports/production-container.repository.js";
import type { ContainerRule } from "../domain/services/production-worksheet.js";

/**
 * Les contenants du fournil, dans le schéma `production`.
 *
 * 🔴 **Deux classes, et pas une.** Les deux ports sont des classes abstraites —
 * c'est ainsi que tout le dépôt les injecte — et TypeScript n'hérite pas de
 * deux classes. Restaient trois options : une classe et deux `useExisting`, un
 * port unique, ou deux adaptateurs. Le port unique est écarté par l'ISP (la
 * fiche n'écrit rien) ; `useExisting` sur un objet qui n'étend qu'un des deux
 * ports demanderait un cast pour satisfaire l'autre, et le dépôt en compte
 * zéro hors des tests. Deux classes coûtent trois lignes de constructeur et ne
 * mentent sur rien.
 *
 * Le SKU est la clé naturelle et reste **opaque** : la production ne joint rien
 * vers le catalogue, elle garde le mot pour pouvoir en reparler.
 */
@Injectable()
export class PrismaProductionContainerReader extends ProductionContainerReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Tout le réglage d'un coup, et sans filtre par SKU.
   *
   * La table compte une ligne par produit au four — quelques dizaines. Lire
   * l'ensemble coûte une requête là où une lecture par article en coûterait
   * autant que la fiche a de lignes.
   */
  async allBySku(): Promise<ReadonlyMap<string, ContainerRule>> {
    const rows = await this.prisma.productionContainer.findMany({
      select: { sku: true, unitsPerContainer: true, singular: true, plural: true },
    });
    return new Map(
      rows.map((row) => [
        row.sku,
        { unitsPerContainer: row.unitsPerContainer, singular: row.singular, plural: row.plural },
      ]),
    );
  }
}

/** L'écriture du même réglage — cf. l'en-tête du lecteur pour les deux classes. */
@Injectable()
export class PrismaProductionContainerRepository extends ProductionContainerRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(sku: string, rule: ContainerRule, staffSubject: string): Promise<void> {
    await this.prisma.productionContainer.upsert({
      where: { sku },
      create: { sku, ...rule, updatedBy: staffSubject },
      update: { ...rule, updatedBy: staffSubject },
    });
  }

  /**
   * `deleteMany` et non `delete` : Prisma lève sur une ligne absente, et
   * « retirer ce qui n'est pas là » n'est pas une erreur — c'est déjà l'état
   * demandé. Le port le dit, l'adaptateur le tient.
   */
  async remove(sku: string): Promise<void> {
    await this.prisma.productionContainer.deleteMany({ where: { sku } });
  }
}
