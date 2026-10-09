import type { Clock } from "../../../platform/time/clock.js";
import { LegalEntityNotFoundError } from "../domain/errors/accounting-errors.js";
import type { BillableOrdersReader } from "../domain/ports/billable-orders.reader.js";
import type { CreditorReader } from "../domain/ports/creditor.reader.js";
import type { DebtorMandateReader } from "../domain/ports/debtor-mandate.reader.js";
import type { RecordedClosureReader } from "../domain/ports/recorded-closure.reader.js";
import { cycleAt } from "../domain/services/billing-cycle.js";
import { cycleTagOf, isSchemeFileDepositable, renderPain008 } from "../domain/services/pain008.js";
import type { SepaScheme } from "../domain/value-objects/sepa-scheme.js";

/**
 * Le brouillon du cycle, **construit une seule fois pour deux sorties**.
 *
 * 🔴 Le XML et son CSV de contrôle passent par ici tous les deux, et c'est la
 * condition pour que le contrôle vaille quelque chose : si l'audit rendait le
 * fichier par un autre chemin, il attesterait un fichier que personne ne
 * télécharge. Le rendu est déterministe, mais deux chemins finiraient par
 * diverger — c'est toujours ainsi que ça se passe.
 *
 * Ce n'est pas un handler : c'est le geste partagé par deux lectures, sur le
 * modèle de `legal-entity-support.ts`.
 */
export interface CycleDraftDeps {
  readonly creditors: CreditorReader;
  readonly billable: BillableOrdersReader;
  readonly debtors: DebtorMandateReader;
  readonly closures: RecordedClosureReader;
  readonly clock: Clock;
}

export interface CycleDraft {
  readonly xml: string;
  readonly scheme: SepaScheme;
  /**
   * Le FICHIER de ce schéma est-il déposable — cycle entier mandaté, et au moins
   * une ligne ici ? C'est ce qui décide du bandeau DANS le fichier ; l'exposer
   * fait que son NOM dit la même chose.
   */
  readonly depositable: boolean;
  /** Le SIREN de l'émetteur : deux entités, deux fichiers au nom distinct. */
  readonly creditorSiren: string;
  /** `202609` — le mois COUVERT, pas celui de la clôture. */
  readonly cycleTag: string;
}

/** @throws {LegalEntityNotFoundError} l'entité n'existe pas. */
export async function buildCycleDraft(
  deps: CycleDraftDeps,
  legalEntityId: string,
  scheme: SepaScheme,
): Promise<CycleDraft> {
  // `CreditorReader` REFUSE de rendre une copie pour une entité qui ne peut pas
  // encaisser : l'incomplétude du bloc créancier est donc inexprimable ici, et
  // il n'y a aucune branche à écrire — donc aucune à oublier.
  const creditor = await deps.creditors.snapshot(legalEntityId);
  if (creditor === null) {
    throw new LegalEntityNotFoundError(legalEntityId);
  }

  const now = deps.clock.now();
  // La dernière clôture ENREGISTRÉE de l'entité — le lot figé l'écrit depuis
  // le 2026-10-05 (plan `lot-de-prelevement-fige.md`).
  const cycle = cycleAt(now, await deps.closures.lastClosure(legalEntityId));
  const lines = await deps.billable.billableBetween(cycle.startsAt, cycle.closesAt);

  // Une seule lecture pour TOUT le cycle, tous schémas confondus, et APRÈS
  // l'assiette. Tous schémas, parce que le caractère déposable se juge sur le
  // cycle entier avant la découpe (plan mandat deux schémas, objection 3).
  // Après l'assiette : on ne demande les
  // mandats que des sociétés qui doivent effectivement quelque chose. Déchiffrer
  // les IBAN de clients qui ne sont pas dans le cycle serait ouvrir le coffre
  // pour rien.
  const mandates = await deps.debtors.activeFor(lines.map((line) => line.companyId));

  return {
    xml: withPreviewNotice(
      renderPain008({
        creditor,
        scheme,
        mandates,
        cycleStart: cycle.startsAt,
        cycleEnd: cycle.closesAt,
        createdAt: now,
        lines,
      }),
    ),
    scheme,
    cycleTag: cycleTagOf(cycle.closesAt),
    depositable: isSchemeFileDepositable(lines, mandates, scheme),
    creditorSiren: creditor.siren,
  };
}

/**
 * 🔴 L'aperçu n'est JAMAIS déposable (2026-10-05) : ses identifiants dérivent
 * du cycle, et seul le fichier d'un LOT constitué part à la banque. Le
 * commentaire le dit dans le fichier même quand le cycle est entièrement
 * mandaté — c'est le cas où on le confondrait avec un lot.
 */
export const PREVIEW_NOTICE =
  "<!-- APERCU DU CYCLE EN COURS - NON DEPOSABLE. Deposer le fichier d'un lot constitue. -->";

function withPreviewNotice(xml: string): string {
  const [declaration, ...rest] = xml.split("\n");
  return [declaration, PREVIEW_NOTICE, ...rest].join("\n");
}
