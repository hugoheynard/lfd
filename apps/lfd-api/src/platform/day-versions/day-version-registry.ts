import { DAY_JOURNALS, type DayJournal } from "@lfd/contracts";

import { TechnicalError } from "../shared/errors/app-error.js";
import type { DaySubjectVersion } from "./day-content-tag.js";
import type { DayVersionSource } from "./day-version-source.js";

/** Un montage qui laisse un sujet sans source, ou lui en donne deux. */
export class DayVersionRegistryMisassembledError extends TechnicalError {
  constructor(detail: string) {
    super(
      "day_versions.registry_misassembled",
      `Le registre des versions est mal monté : ${detail}. Chaque sujet du contrat ` +
        "(`DAY_JOURNALS`, `GLOBAL_VERSION_SUBJECTS`) doit avoir exactement une source, " +
        "reliée dans `appBootstrap/day-version-sources.module.ts`.",
    );
  }
}

/**
 * **Le registre des journaux de journée** — la SEULE déclaration de qui sert
 * quel journal (`version-par-journee.md`, D8).
 *
 * Il refuse de se construire si un journal du contrat n'a pas de source, ou en
 * a deux : l'API ne démarre pas plutôt que de servir une porte qui tairait un
 * journal, ou le lirait deux fois sous deux droits différents. C'est le cran
 * « refusé au démarrage », plus fort qu'un test.
 */
export class DayVersionRegistry {
  private readonly byJournal: ReadonlyMap<DayJournal, DayVersionSource>;

  constructor(sources: readonly DayVersionSource[]) {
    const byJournal = new Map<DayJournal, DayVersionSource>();
    for (const source of sources) {
      if (byJournal.has(source.journal)) {
        throw new DayVersionRegistryMisassembledError(
          `le journal « ${source.journal} » a deux sources`,
        );
      }
      byJournal.set(source.journal, source);
    }
    const missing = DAY_JOURNALS.filter((journal) => !byJournal.has(journal));
    if (missing.length > 0) {
      throw new DayVersionRegistryMisassembledError(
        `aucune source pour « ${missing.join(" », « ")} »`,
      );
    }
    this.byJournal = byJournal;
  }

  /** La source d'un journal — toujours présente, le constructeur l'a garanti. */
  sourceOf(journal: DayJournal): DayVersionSource {
    const source = this.byJournal.get(journal);
    if (source === undefined) {
      throw new DayVersionRegistryMisassembledError(`aucune source pour « ${journal} »`);
    }
    return source;
  }

  /**
   * Les numéros de ces journaux pour la journée `AAAA-MM-JJ`, lus EN BASE —
   * l'étiquette d'un contenu de journée (`DayContents`). L'écran les lit
   * AVANT ses données : lus après, ils couvriraient une écriture que le
   * contenu n'a pas.
   *
   * @throws {DomainError} la journée n'existe pas au calendrier.
   */
  versionsOf(journals: readonly DayJournal[], serviceDay: string): Promise<DaySubjectVersion[]> {
    return Promise.all(
      journals.map(async (journal) => ({
        subject: journal,
        version: await this.sourceOf(journal).versionOf(serviceDay),
      })),
    );
  }
}
