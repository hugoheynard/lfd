import type { PlanVersionComparison, PlanVersionListing } from "../../../day/index.js";

/**
 * **Ce que servent les routes des versions du plan**
 * (`documentation/fournil/plan-historique-des-tirages.md`, lot H4) — les
 * formes du noyau, ses instants en chaînes ISO. Les types du noyau sont lus
 * sur ses deux ports publiés : `day/index.ts` n'exporte pas un nom de plus
 * pour eux.
 */

type PlanVersionEntry = Awaited<ReturnType<PlanVersionListing["listOf"]>>[number];
type PlanVersionDiff = Awaited<ReturnType<PlanVersionComparison["compare"]>>;
type PlanVersionMark = PlanVersionDiff["from"];

/**
 * Qui a fait le geste. `name` du staff : le nom figé au geste, sinon celui de
 * l'annuaire aujourd'hui, sinon `null` (l'écran dit « l'équipe »). L'écran
 * dit « le client » pour `customer` et `guest`, « automatique » pour `system`.
 */
export type PlanVersionAuthorView =
  | { readonly kind: "staff"; readonly staffId: string; readonly name: string | null }
  | { readonly kind: "customer" }
  | { readonly kind: "guest" }
  | { readonly kind: "system" };

/**
 * « Papier rangé ou non », lu au stockage (§ 1.12). `version` : celle dont le
 * papier sert (§ 1.14) — elle-même, ou la précédente pour un retrait ; `null`
 * : aucune. `dossier` / `count` : `true` rangé, `false` non rangé, `null` le
 * stockage n'a pas répondu (on ne sait pas).
 */
export interface PlanVersionPaperView {
  readonly version: number | null;
  readonly dossier: boolean | null;
  readonly count: boolean | null;
}

/** Une ligne de la liste des versions. */
export interface PlanVersionView {
  readonly version: number;
  readonly cause: PlanVersionEntry["cause"];
  readonly recordedAt: string;
  readonly author: PlanVersionAuthorView;
  readonly closedAt: string;
  readonly printRun: number;
  readonly shipmentCount: number;
  readonly paper: PlanVersionPaperView;
}

/** Une version qui a fait un changement, instants en ISO. */
export type PlanVersionMarkView = Omit<PlanVersionMark, "recordedAt" | "closedAt"> & {
  readonly recordedAt: string;
  readonly closedAt: string;
};

/** Un élément du diff, sa version (`by`) en ISO. */
type Marked<T> = T extends { readonly by: PlanVersionMark }
  ? Omit<T, "by"> & { readonly by: PlanVersionMarkView }
  : never;

/** La comparaison de deux versions : le diff du noyau tel quel, instants en ISO. */
export interface PlanVersionDiffView {
  readonly from: PlanVersionMarkView;
  readonly to: PlanVersionMarkView;
  readonly baselineUnknown: boolean;
  readonly production: PlanVersionDiff["production"];
  readonly changes: readonly Marked<PlanVersionDiff["changes"][number]>[];
  readonly resupplies: readonly Marked<PlanVersionDiff["resupplies"][number]>[];
  readonly toCheck: readonly Marked<PlanVersionDiff["toCheck"][number]>[];
}

/** Un envoi du dossier, tel que l'écran le date. */
export interface DossierDispatchMarkView {
  readonly at: string;
  /** `null` : envoi d'avant les versions. */
  readonly planVersion: number | null;
}

/**
 * Un destinataire du dossier aujourd'hui, et ce qu'il a reçu de la journée.
 * `lastReceived` : le dernier envoi parti (`sent`) ; `lastAttempt` : le
 * dernier envoi, quelle qu'en soit l'issue.
 */
export interface DossierDispatchView {
  readonly recipientId: string;
  readonly name: string;
  readonly lastReceived: DossierDispatchMarkView | null;
  readonly lastAttempt:
    (DossierDispatchMarkView & { readonly outcome: "pending" | "sent" | "failed" }) | null;
}
