import type { ActivationStatus, ActivationStep, ActivationView } from "@lfd/contracts";

import { ACTIVITY_TYPES } from "./activity-event.js";
import type { CompanyIdentity } from "./ports/company-namer.js";

/**
 * Projection **Activation & frictions** — dérivée du journal, au niveau
 * **société** (sujet = company). La forme de sortie (`ActivationView`) est le
 * contrat partagé `@lfd/contracts` ; ici vit la **dérivation pure** : quelles
 * pièces sont franchies (complétion), depuis combien de temps le dossier est
 * bloqué (adoption-stalled), et s'il s'est créé **sans aucune main du staff**
 * (adoption+, product-led).
 */

/** Les 4 pièces du tunnel, dans l'ordre canonique (runtime, pour l'itération). */
export const ACTIVATION_STEPS: readonly ActivationStep[] = ["vat", "kbis", "billing", "delivery"];

/** Un événement du journal (sujet = société), réduit à ce que la projection lit. */
export interface ActivationEvent {
  readonly type: string;
  readonly subjectId: string;
  readonly occurredAt: Date;
  readonly actorType: string;
  readonly payload: Record<string, unknown>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Les sociétés que ce lot d'événements nomme, dédupliquées — de quoi demander
 * leur identité **en une lecture** avant de dériver.
 *
 * Vit ici, et pas dans l'adaptateur, parce que c'est la même question que se
 * posent les deux appelants de `deriveActivations` (la projection de l'écran et
 * le recompute du cockpit) : la dupliquer les laisserait diverger.
 */
export function companyIdsOf(events: readonly ActivationEvent[]): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === ACTIVITY_TYPES.companyDeclared) {
      ids.add(event.subjectId);
    }
  }
  return [...ids];
}

/**
 * Dérive le tunnel d'activation par société. **Pure et déterministe** (temps
 * injecté). N'inclut que les sociétés **déclarées** dans le journal (le fait
 * fondateur). Trie les `pending` d'abord (les dossiers à pousser), les plus
 * anciennement bloqués en tête.
 *
 * `names` est l'annuaire des enseignes, résolu par l'appelant
 * (`companyIdsOf` → `CompanyNamer.namesOf`). Absent, chaque dossier sort avec
 * `companyName: null` — c'est le cas des lectures qui ne font que compter
 * (`deriveGrowthStats`), et qui n'ont personne à nommer.
 */
export function deriveActivations(
  events: readonly ActivationEvent[],
  now: Date,
  names: ReadonlyMap<string, CompanyIdentity> = new Map(),
): ActivationView[] {
  const byCompany = new Map<string, ActivationEvent[]>();
  for (const event of events) {
    const bucket = byCompany.get(event.subjectId) ?? [];
    bucket.push(event);
    byCompany.set(event.subjectId, bucket);
  }

  const activations: ActivationView[] = [];
  for (const [companyId, companyEvents] of byCompany) {
    const declared = companyEvents.find((event) => event.type === ACTIVITY_TYPES.companyDeclared);
    if (declared === undefined) {
      continue; // pas de fait fondateur au journal → hors tunnel.
    }
    const activated = companyEvents.find((event) => event.type === ACTIVITY_TYPES.companyActivated);
    const stepsReached = reachedSteps(companyEvents);
    const declaredVia = stringOrNull(declared.payload["via"]) === "staff" ? "staff" : "self";
    const status: ActivationStatus = activated !== undefined ? "active" : "pending";

    activations.push({
      companyId,
      companyName: names.get(companyId)?.enseigne ?? null,
      declaredVia,
      declaredAt: declared.occurredAt.toISOString(),
      status,
      activatedAt: activated?.occurredAt.toISOString() ?? null,
      stepsReached,
      stepsMissing: ACTIVATION_STEPS.filter((step) => !stepsReached.includes(step)),
      completion: stepsReached.length / ACTIVATION_STEPS.length,
      adoptionPlus: declaredVia === "self" && !hasStaffInteraction(companyEvents),
      stalledDays:
        status === "pending"
          ? Math.max(0, Math.floor((now.getTime() - declared.occurredAt.getTime()) / DAY_MS))
          : null,
    });
  }

  return activations.sort(byPendingThenStalled);
}

/** Les pièces franchies, dédupliquées, dans l'ordre canonique. */
function reachedSteps(events: readonly ActivationEvent[]): ActivationStep[] {
  const reached = new Set<string>();
  for (const event of events) {
    if (event.type === ACTIVITY_TYPES.companyStepReached) {
      const step = stringOrNull(event.payload["step"]);
      if (step !== null) {
        reached.add(step);
      }
    }
  }
  return ACTIVATION_STEPS.filter((step) => reached.has(step));
}

/**
 * Vrai si le staff a **mis la main** au dossier (déclaration ou pièce posée par
 * lui). L'**activation** est exclue : c'est le clic d'aboutissement (toujours
 * staff), pas du hand-holding — sinon aucune société activée ne serait jamais
 * adoption+, ce qui viderait le concept 0-touch de son sens.
 */
function hasStaffInteraction(events: readonly ActivationEvent[]): boolean {
  return events.some(
    (event) => event.actorType === "staff" && event.type !== ACTIVITY_TYPES.companyActivated,
  );
}

/** `pending` d'abord ; à statut égal, le plus anciennement bloqué en tête. */
function byPendingThenStalled(a: ActivationView, b: ActivationView): number {
  if (a.status !== b.status) {
    return a.status === "pending" ? -1 : 1;
  }
  return (b.stalledDays ?? 0) - (a.stalledDays ?? 0);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
