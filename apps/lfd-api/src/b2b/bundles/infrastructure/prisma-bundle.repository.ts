import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Bundle } from "../domain/entities/bundle.js";
import { BundleKeyTakenError } from "../domain/errors/bundle-errors.js";
import { BundleRepository } from "../domain/ports/bundle.repository.js";
import { GROUPS_IN_ORDER, bundleColumns, choiceRows, groupRows, toRecord } from "./bundle-rows.js";

/**
 * Le dépôt d'écriture des formules, sur `bundles`, `bundle_groups` et
 * `bundle_choices`.
 *
 * La composition est RÉÉCRITE à chaque `save`, dans la transaction du fait de
 * journal : des lignes de rattachement, pas une histoire — le journal la
 * porte (`bundle.composition_saved`, avant → après). La formule, elle, n'est
 * jamais supprimée.
 */
@Injectable()
export class PrismaBundleRepository extends BundleRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(key: string): Promise<Bundle | null> {
    const row = await this.prisma.bundle.findUnique({ where: { key }, include: GROUPS_IN_ORDER });
    return row === null ? null : Bundle.reconstitute(toRecord(row));
  }

  /**
   * Crée — jamais n'écrase. Deux onglets qui créent « Petit déjeuner » au même
   * instant passent tous deux la vérification du cas d'usage ; l'index unique
   * de la clé départage, et le second reçoit la phrase qui explique.
   */
  async add(bundle: Bundle): Promise<void> {
    const snapshot = bundle.snapshot();
    try {
      await this.prisma.bundle.create({
        data: {
          id: snapshot.id,
          key: snapshot.key,
          createdAt: snapshot.createdAt,
          ...bundleColumns(snapshot),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BundleKeyTakenError(snapshot.key);
      }
      throw error;
    }
    await this.writeComposition(bundle);
  }

  async save(bundle: Bundle): Promise<void> {
    const snapshot = bundle.snapshot();
    await this.prisma.bundle.update({ where: { id: snapshot.id }, data: bundleColumns(snapshot) });
    // Les choix d'abord : la clé étrangère vers leur groupe refuse l'inverse.
    await this.prisma.bundleChoice.deleteMany({ where: { bundleId: snapshot.id } });
    await this.prisma.bundleGroup.deleteMany({ where: { bundleId: snapshot.id } });
    await this.writeComposition(bundle);
  }

  private async writeComposition(bundle: Bundle): Promise<void> {
    const snapshot = bundle.snapshot();
    await this.prisma.bundleGroup.createMany({ data: groupRows(snapshot) });
    await this.prisma.bundleChoice.createMany({ data: choiceRows(snapshot) });
  }
}
