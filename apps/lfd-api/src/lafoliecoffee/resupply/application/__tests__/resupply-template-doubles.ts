import { ResupplyTemplate, type ResupplyTemplateSnapshot } from "../../domain/resupply-template.js";
import {
  ResupplyTemplateAlreadyWrittenError,
  ResupplyTemplateChangedMeanwhileError,
  ResupplyTemplateNameTakenError,
} from "../../domain/resupply-template-errors.js";
import { ResupplyTemplateReader } from "../../domain/resupply-template.reader.js";
import { ResupplyTemplateRepository } from "../../domain/resupply-template.repository.js";

/**
 * Les modèles en mémoire, lecture ET écriture, avec ce que la base tient :
 * la clé primaire, le verrou de version et l'index partiel du nom actif.
 */
export class InMemoryResupplyTemplates extends ResupplyTemplateRepository {
  private readonly rows = new Map<string, ResupplyTemplateSnapshot>();
  saves = 0;

  load(templateId: string): Promise<ResupplyTemplate | null> {
    const row = this.rows.get(templateId);
    return Promise.resolve(row === undefined ? null : ResupplyTemplate.restore(row));
  }

  save(template: ResupplyTemplate): Promise<void> {
    const current = this.rows.get(template.id);
    if (template.version === 0 && current !== undefined) {
      return Promise.reject(new ResupplyTemplateAlreadyWrittenError(template.id));
    }
    if (template.version !== 0 && current?.version !== template.version) {
      return Promise.reject(new ResupplyTemplateChangedMeanwhileError());
    }
    if (template.archived === null && this.nameTaken(template)) {
      return Promise.reject(new ResupplyTemplateNameTakenError(template.content.name));
    }
    this.rows.set(template.id, { ...template.snapshot(), version: template.nextVersion });
    this.saves += 1;
    return Promise.resolve();
  }

  /** Un modèle tel qu'il serait déjà écrit en base. */
  seed(snapshot: ResupplyTemplateSnapshot): void {
    this.rows.set(snapshot.id, snapshot);
  }

  row(templateId: string): ResupplyTemplateSnapshot | undefined {
    return this.rows.get(templateId);
  }

  all(): readonly ResupplyTemplateSnapshot[] {
    return [...this.rows.values()];
  }

  private nameTaken(template: ResupplyTemplate): boolean {
    const name = template.content.name.toLowerCase();
    return this.all().some(
      (row) =>
        row.id !== template.id &&
        row.siteId === template.siteId &&
        row.archived === null &&
        row.content.name.toLowerCase() === name,
    );
  }
}

/** Le lecteur sur le même stockage : les actifs du point, par nom. */
export class InMemoryResupplyTemplateReader extends ResupplyTemplateReader {
  constructor(private readonly store: InMemoryResupplyTemplates) {
    super();
  }

  listActive(siteId: string): Promise<readonly ResupplyTemplateSnapshot[]> {
    return Promise.resolve(
      this.store
        .all()
        .filter((row) => row.siteId === siteId && row.archived === null)
        .sort((a, b) => a.content.name.localeCompare(b.content.name)),
    );
  }
}
