import type {
  AccessibilityConformityView,
  AccessibilityCorrectionStatus,
  AccessibilityCorrectionView,
  AccessibilityFollowUpView,
} from "@lfd/contracts";

import { AccessibilityFollowUpReader } from "../domain/accessibility-follow-up.reader.js";
import { InvalidAccessibilityFollowUpError } from "../domain/errors/accessibility-follow-up-errors.js";
import followUpJson from "./embedded/accessibility-follow-up.json" with { type: "json" };

/** La forme du fichier généré, avant que ses statuts soient reconnus. */
export interface EmbeddedFollowUp {
  readonly corrections: readonly {
    readonly theme: number | null;
    readonly date: string | null;
    readonly status: string;
    readonly label: { readonly fr: string; readonly en: string; readonly it: string };
  }[];
  readonly audit: { readonly plannedFor: string | null; readonly completedOn: string | null };
  readonly conformity: AccessibilityConformityView | null;
}

const STATUSES: readonly AccessibilityCorrectionStatus[] = ["done", "in_progress", "planned"];

function statusOf(raw: string): AccessibilityCorrectionStatus {
  const status = STATUSES.find((candidate) => candidate === raw);
  if (status === undefined) {
    throw new InvalidAccessibilityFollowUpError(raw);
  }
  return status;
}

/** Reconnaît les statuts du fichier généré ; le reste a déjà la forme du contrat. */
export function followUpViewOf(embedded: EmbeddedFollowUp): AccessibilityFollowUpView {
  const corrections: AccessibilityCorrectionView[] = embedded.corrections.map((entry) => ({
    theme: entry.theme,
    date: entry.date,
    status: statusOf(entry.status),
    label: { fr: entry.label.fr, en: entry.label.en, it: entry.label.it },
  }));
  return { corrections, audit: { ...embedded.audit }, conformity: embedded.conformity };
}

/**
 * **Le suivi que cette API a compilé** : `embedded/accessibility-follow-up.json`,
 * déposé par `pnpm rgaa:digest` depuis la grille d'audit. L'API part de
 * `src/` et ne peut pas lire `documentation/` en place ; `lint:rgaa-digest`
 * refuse une copie qui retarde sur la grille.
 *
 * Lu une fois, à la construction : le fichier ne change qu'au déploiement.
 */
export class EmbeddedAccessibilityFollowUpReader extends AccessibilityFollowUpReader {
  private readonly view = followUpViewOf(followUpJson);

  read(): AccessibilityFollowUpView {
    return this.view;
  }
}
