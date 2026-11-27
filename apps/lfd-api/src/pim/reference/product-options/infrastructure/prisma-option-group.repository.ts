import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { OptionGroup } from "../domain/entities/option-group.js";
import { OptionGroupRepository } from "../domain/ports/option-group.repository.js";
import {
  optionAudience,
  type OptionChoiceSnapshot,
} from "../domain/value-objects/option-choice.js";

interface OptionChoiceRow {
  readonly key: string;
  readonly label: string;
  readonly audience: string;
  readonly position: number;
  readonly archivedAt: Date | null;
}

interface OptionGroupRow {
  readonly id: string;
  readonly name: string;
  readonly archivedAt: Date | null;
  readonly choices: readonly OptionChoiceRow[];
}

/** La ligne relue repasse par l'agrégat : chaque choix revalide sa clé et sa clientèle. */
function toDomain(row: OptionGroupRow): OptionGroup {
  return OptionGroup.reconstitute({
    id: row.id,
    name: row.name,
    archivedAt: row.archivedAt,
    choices: row.choices.map((choice) => ({
      key: choice.key,
      label: choice.label,
      // Le CHECK `option_choice_audience_known` tient la valeur ; une valeur
      // inconnue se signale ici plutôt que d'être devinée.
      audience: optionAudience(choice.audience),
      position: choice.position,
      archivedAt: choice.archivedAt,
    })),
  });
}

function choiceColumns(choice: OptionChoiceSnapshot) {
  return {
    label: choice.label,
    audience: choice.audience,
    position: choice.position,
    archivedAt: choice.archivedAt,
  };
}

const WITH_CHOICES = { choices: { orderBy: { position: "asc" as const } } };

/**
 * Le groupe et ses choix, écrits ensemble. Un choix ne se supprime jamais :
 * l'agrégat le garde archivé, et `save` réécrit chaque choix qu'il porte.
 */
@Injectable()
export class PrismaOptionGroupRepository extends OptionGroupRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async listAll(): Promise<OptionGroup[]> {
    const rows = await this.prisma.optionGroup.findMany({
      include: WITH_CHOICES,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<OptionGroup | null> {
    const row = await this.prisma.optionGroup.findUnique({ where: { id }, include: WITH_CHOICES });
    return row === null ? null : toDomain(row);
  }

  async add(group: OptionGroup): Promise<void> {
    const { id, name, archivedAt, choices } = group.snapshot();
    await this.prisma.optionGroup.create({
      data: {
        id,
        name,
        archivedAt,
        choices: {
          create: choices.map((choice) => ({ key: choice.key, ...choiceColumns(choice) })),
        },
      },
    });
  }

  async save(group: OptionGroup): Promise<void> {
    const { id, name, archivedAt, choices } = group.snapshot();
    await this.prisma.optionGroup.update({ where: { id }, data: { name, archivedAt } });
    for (const choice of choices) {
      await this.prisma.optionChoice.upsert({
        where: { optionGroupId_key: { optionGroupId: id, key: choice.key } },
        create: { optionGroupId: id, key: choice.key, ...choiceColumns(choice) },
        update: choiceColumns(choice),
      });
    }
  }
}
