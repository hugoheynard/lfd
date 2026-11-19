import { Injectable } from "@nestjs/common";

import { isUniqueViolation, violatedConstraint } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ResupplyTemplate } from "../domain/resupply-template.js";
import {
  ResupplyTemplateAlreadyWrittenError,
  ResupplyTemplateChangedMeanwhileError,
  ResupplyTemplateNameTakenError,
} from "../domain/resupply-template-errors.js";
import { ResupplyTemplateRepository } from "../domain/resupply-template.repository.js";
import { templateColumnsOf, templateSnapshotOf } from "./resupply-template.row.js";

/** L'index unique partiel du nom parmi les modèles actifs d'un point (migration 20261119100100). */
const ACTIVE_NAME_INDEX = "resupply_templates_site_active_name_key";

/**
 * Adaptateur Prisma des modèles de réassort (`resupply_templates`), seul
 * lecteur et seul écrivain de la table. Un modèle neuf s'insère — sa clé
 * primaire est la clé de l'écran ; ensuite il se réécrit sous la version lue,
 * zéro ligne touchée disant qu'un autre poste l'a écrit entre-temps (409).
 * L'index partiel du nom refuse un doublon parmi les modèles actifs du point.
 * Jamais supprimé.
 */
@Injectable()
export class PrismaResupplyTemplateRepository extends ResupplyTemplateRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(templateId: string): Promise<ResupplyTemplate | null> {
    const row = await this.prisma.resupplyTemplate.findUnique({ where: { id: templateId } });
    return row === null ? null : ResupplyTemplate.restore(templateSnapshotOf(row));
  }

  async save(template: ResupplyTemplate): Promise<void> {
    try {
      await this.write(template);
    } catch (error) {
      throw this.translated(error, template);
    }
  }

  private async write(template: ResupplyTemplate): Promise<void> {
    if (template.version === 0) {
      const { created } = template;
      await this.prisma.resupplyTemplate.create({
        data: {
          id: template.id,
          siteId: template.siteId,
          version: template.nextVersion,
          createdAt: created.at,
          createdByStaffId: created.author.staffUserId,
          createdByName: created.author.name,
          createdByRole: created.author.role,
          ...templateColumnsOf(template),
        },
      });
      return;
    }
    const { count } = await this.prisma.resupplyTemplate.updateMany({
      where: { id: template.id, version: template.version },
      data: { version: template.nextVersion, ...templateColumnsOf(template) },
    });
    if (count === 0) {
      throw new ResupplyTemplateChangedMeanwhileError();
    }
  }

  /** Une violation d'unicité dit lequel des deux cas : le nom pris, ou la clé déjà écrite. */
  private translated(error: unknown, template: ResupplyTemplate): unknown {
    if (!isUniqueViolation(error)) {
      return error;
    }
    if (violatedConstraint(error)?.includes(ACTIVE_NAME_INDEX) === true) {
      return new ResupplyTemplateNameTakenError(template.content.name);
    }
    if (template.version === 0) {
      return new ResupplyTemplateAlreadyWrittenError(template.id);
    }
    return error;
  }
}
