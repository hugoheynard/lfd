import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CompanyMercuriale } from "../domain/entities/company-mercuriale.js";
import { CompanyMercurialeRepository } from "../domain/ports/company-mercuriale.repository.js";
import type { PricingAct } from "../domain/pricing-act.js";
import { RunningMercurialeError } from "../domain/pricing-errors.js";
import { PricingActWriter } from "./pricing-act.writer.js";
import { isExclusionViolation } from "./exclusion-violation.js";
import { mercurialeFromRow } from "./mercuriale-rows.js";

/** Le nom de la contrainte, tel que la migration l'écrit. Cf. `isExclusionViolation`. */
const OVERLAP_CONSTRAINT = "company_mercuriales_no_overlap";

@Injectable()
export class PrismaCompanyMercurialeRepository extends CompanyMercurialeRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acts: PricingActWriter,
  ) {
    super();
  }

  /**
   * La mercuriale **et** son acte, dans la même transaction — « aucun changement
   * sans sa trace ».
   *
   * 🔴 **Une écriture, là où il en fallait N.** La pose écrivait une règle et un
   * acte par article et par palier ; sur quatre-vingt-douze articles, cela
   * faisait une transaction interactive assez longue pour expirer, et la pose
   * par gabarit ne les entourait même pas d'une transaction — elle laissait un
   * client à moitié tarifé quand elle échouait à mi-parcours. Ce n'est plus
   * « transactionnel », c'est **atomique par construction**.
   *
   * @throws {RunningMercurialeError} une mercuriale couvre déjà cette période
   *   chez ce client. C'est la contrainte d'exclusion qui parle ; sa réponse est
   *   traduite plutôt qu'avalée, parce que le commercial doit savoir quoi clore.
   */
  async save(mercuriale: CompanyMercuriale, act: PricingAct): Promise<void> {
    const state = mercuriale.toPersistence();
    try {
      await this.acts.around(act, () =>
        this.prisma.companyMercuriale.create({
          data: {
            id: state.id,
            companyId: state.companyId,
            label: state.label,
            // La grille part telle que l'agrégat la rend : triée et vérifiée.
            //
            // Les champs sont **réécrits un par un** plutôt que répandus. Ce
            // n'est pas de la cérémonie : une interface TypeScript n'a pas de
            // signature d'index implicite, donc elle ne franchit pas la
            // frontière du JSON — le compilateur oblige à dire ce qu'on écrit.
            // C'est le bon effet : la forme persistée est lisible ici, et un
            // champ ajouté à l'agrégat ne part pas en base par accident.
            lines: state.lines.map((line) => ({
              sku: line.sku,
              tiers: line.tiers.map((tier) => ({
                minQuantity: tier.minQuantity,
                unitPriceMillicents: tier.unitPriceMillicents,
              })),
            })),
            validFrom: state.validFrom,
            validTo: state.validTo,
            createdBy: state.createdBy,
          },
        }),
      );
    } catch (error) {
      if (isExclusionViolation(error, OVERLAP_CONSTRAINT)) {
        throw new RunningMercurialeError(state.label, state.validFrom, state.validTo);
      }
      throw error;
    }
  }

  /** Une transition — clore, suspendre, reprendre. Seul le cycle de vie bouge. */
  async update(mercuriale: CompanyMercuriale, act: PricingAct): Promise<void> {
    const { id, lifecycle } = mercuriale.toPersistence();
    await this.acts.around(act, () =>
      this.prisma.companyMercuriale.update({
        where: { id },
        data: {
          pausedAt: lifecycle.pausedAt,
          pausedBy: lifecycle.pausedBy,
          archivedAt: lifecycle.archivedAt,
          archivedBy: lifecycle.archivedBy,
          archiveReason: lifecycle.archiveReason,
        },
      }),
    );
  }

  /**
   * Le renommage : **une seule colonne**, plus l'acte.
   *
   * Écrire ici la grille ou la fenêtre serait trivial, et c'est précisément pour
   * ça que cette méthode ne le fait pas : ce qu'elle n'écrit pas est ce qu'elle
   * garantit. Un prix qui a facturé ne se retouche pas — il se clôt et se
   * repose.
   */
  async rename(mercuriale: CompanyMercuriale, act: PricingAct): Promise<void> {
    const { id, label } = mercuriale.toPersistence();
    await this.acts.around(act, () =>
      this.prisma.companyMercuriale.update({ where: { id }, data: { label } }),
    );
  }

  async load(id: string): Promise<CompanyMercuriale | null> {
    const row = await this.prisma.companyMercuriale.findUnique({ where: { id } });
    return row === null ? null : mercurialeFromRow(row);
  }

  /**
   * **Les mercuriales RANGÉES qui recouvrent cette fenêtre.**
   *
   * Même clause que {@link runningFor}, à l'archivage près — et c'est ce qui la
   * rend nécessaire : la contrainte d'exclusion est **partielle**
   * (`WHERE archived_at IS NULL`), donc elle ne voit pas les rangées. Sans cette
   * lecture, on peut poser par-dessus une période qu'une mercuriale close a
   * réellement facturée, et la relecture datée y trouverait alors deux tarifs.
   *
   * Elle rend des **identifiants** et non des objets : l'appelant n'en fait
   * qu'une chose, demander au port des commandes si l'une d'elles a facturé.
   * Reconstituer des agrégats pour les jeter serait payer la grille de chacune.
   */
  async archivedOverlapping(
    companyId: string,
    validFrom: Date,
    validTo: Date | null,
  ): Promise<readonly string[]> {
    const rows = await this.prisma.companyMercuriale.findMany({
      where: {
        companyId,
        archivedAt: { not: null },
        ...(validTo === null ? {} : { validFrom: { lt: validTo } }),
        OR: [{ validTo: null }, { validTo: { gt: validFrom } }],
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async runningFor(
    companyId: string,
    validFrom: Date,
    validTo: Date | null,
  ): Promise<CompanyMercuriale | null> {
    // Bornes basse incluse, haute exclue : deux fenêtres qui se succèdent à la
    // même date ne se recouvrent pas. La clause dit exactement ce que la
    // contrainte d'exclusion refuse — c'est ce qui fait que le pré-contrôle et
    // la base ne peuvent pas se contredire.
    const row = await this.prisma.companyMercuriale.findFirst({
      where: {
        companyId,
        archivedAt: null,
        ...(validTo === null ? {} : { validFrom: { lt: validTo } }),
        OR: [{ validTo: null }, { validTo: { gt: validFrom } }],
      },
    });
    return row === null ? null : mercurialeFromRow(row);
  }
}
