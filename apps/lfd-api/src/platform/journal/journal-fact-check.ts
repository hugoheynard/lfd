import { Logger } from "@nestjs/common";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { TechnicalError } from "../shared/errors/app-error.js";

/**
 * Un fait que le catalogue ne reconnaît pas — type inconnu ou retiré, charge
 * qui ne suit pas son schéma — refusé parce que le journal tourne en mode
 * strict (sous les harnais de test, jamais en production).
 *
 * Technique, pas métier : ce n'est pas le geste qui est faux, c'est la
 * description qu'on en donne au journal. Le message nomme le type et la clé
 * fautive ; la sortie est d'ajouter ou de corriger l'entrée du catalogue.
 */
export class JournalFactNotCataloguedError extends TechnicalError {
  constructor(problem: string) {
    super(
      "platform.journal.fact_not_catalogued",
      `Fait refusé par le journal (mode strict) : ${problem}. Ajoutez ou corrigez son entrée ` +
        `dans @lfd/contracts/journal-facts.`,
    );
  }
}

/** Où part l'écart en mode indulgent : le journal applicatif, en erreur. */
export type JournalFactReport = (message: string) => void;

/**
 * **La vérification à l'écriture** (D2 du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`) : chaque fait est
 * confronté au catalogue `@lfd/contracts/journal-facts` au moment de l'écrire.
 *
 * - **strict** (tests unitaires et e2e) : l'écart **lève** — c'est ce qui rend
 *   le catalogue exact, puisque tout fait écrit par un test y est confronté ;
 * - **indulgent** (production, par défaut) : l'écart part au journal
 *   applicatif en **erreur**, et le fait s'écrit quand même. Le journal est
 *   dans la transaction du geste : une charge mal décrite ne doit jamais
 *   annuler une commande réelle (Hugo, 2026-09-19).
 *
 * Le mode vient d'`AppConfig.journalFactsStrict()`.
 */
export class JournalFactCheck {
  constructor(
    private readonly strict: boolean,
    private readonly report: JournalFactReport = reportToLog,
  ) {}

  /**
   * @throws {JournalFactNotCataloguedError} en mode strict, si le fait n'est
   *   pas conforme au catalogue.
   */
  verify(type: string, payload: unknown): void {
    const problem = checkJournalFact(type, payload);
    if (problem === null) {
      return;
    }
    if (this.strict) {
      throw new JournalFactNotCataloguedError(problem.message);
    }
    this.report(`Fait écrit malgré un écart au catalogue : ${problem.message}`);
  }
}

const LOGGER = new Logger(JournalFactCheck.name);

function reportToLog(message: string): void {
  LOGGER.error(message);
}
