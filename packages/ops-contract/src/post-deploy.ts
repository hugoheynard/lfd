/**
 * **Les opérations après déploiement**, telles que l'écran « Après
 * déploiement » et le bandeau du back-office les lisent
 * (`documentation/ops/plan-operations-apres-deploiement.md`).
 *
 * Routes, sous le droit `ops_post_deploy` :
 *
 * - `GET  /admin/ops/post-deploy` → {@link PostDeployOverview} (lecture) ;
 * - `POST /admin/ops/post-deploy/:key/simulate` → {@link PostDeployRunStarted}
 *   (lecture : simuler n'écrit que la trace) ;
 * - `POST /admin/ops/post-deploy/:key/apply`, corps {@link PostDeployApplyBody}
 *   → `202` {@link PostDeployRunStarted} (écriture) ;
 * - `GET  /admin/ops/post-deploy/runs/:runId` → {@link PostDeployRunView}.
 *
 * Les dates traversent en ISO. Les rapports portent des comptes et des
 * phrases, jamais une donnée personnelle.
 */

/** `simulated` → `running` → `succeeded` | `failed` | `interrupted`. */
export type PostDeployRunState = "simulated" | "running" | "succeeded" | "failed" | "interrupted";

export interface PostDeployReportView {
  /** Simulation : décisions écrivables (`> 0` = à faire). Application : décisions écrites. */
  readonly writable: number;
  /** Les cas « à trancher à la main » : ils ne tiennent pas l'opération ouverte. */
  readonly byHand: number;
  /** Les comptes, en phrases. */
  readonly summary: readonly string[];
  /** Un échantillon lisible, borné. */
  readonly sample: readonly string[];
}

/** Un passage : une simulation, et l'application qu'elle a peut-être lancée. */
export interface PostDeployRunView {
  readonly id: string;
  readonly operationKey: string;
  readonly state: PostDeployRunState;
  /** La révision de l'image qui a simulé. */
  readonly revision: string;
  /** L'id de la fiche staff qui a simulé — seule à pouvoir appliquer. */
  readonly simulatedBy: string;
  readonly simulatedAt: string;
  /** Au-delà, « Appliquer » est refusé : il faut simuler de nouveau. */
  readonly applicableUntil: string;
  readonly simulation: PostDeployReportView;
  readonly startedAt: string | null;
  /** L'avancement, réécrit après chaque lot ; le rapport final une fois fini. */
  readonly progress: PostDeployReportView | null;
  readonly finishedAt: string | null;
  /** Pourquoi `failed` ou `interrupted`. */
  readonly failure: string | null;
}

export interface PostDeployOperationView {
  /** Stable : la clé des routes. */
  readonly key: string;
  readonly title: string;
  readonly why: string;
  /** Ce qu'elle ne sait pas défaire — à montrer avant « Appliquer », avec « j'ai lu ». */
  readonly limit: string;
  /** Les opérations qui doivent passer avant elle. */
  readonly after: readonly string[];
  /** Sa simulation à l'instant trouve une décision écrivable. */
  readonly toDo: boolean;
  /** Celles de `after` encore à faire : tant qu'il y en a, « Appliquer » est refusé. */
  readonly blockedBy: readonly string[];
  /** La simulation faite pour cette lecture (non tracée). */
  readonly current: PostDeployReportView | null;
  /** Le dernier passage tracé, toutes personnes confondues. */
  readonly lastRun: PostDeployRunView | null;
}

export interface PostDeployOverview {
  /** La révision de l'image qui répond. */
  readonly revision: string;
  /** Au moins une opération à faire : le bandeau s'affiche. */
  readonly anyToDo: boolean;
  /** Dans l'ordre d'exécution. */
  readonly operations: readonly PostDeployOperationView[];
}

export interface PostDeployRunStarted {
  readonly runId: string;
}

/** Le corps d'« Appliquer » : la case « j'ai lu » cochée. */
export interface PostDeployApplyBody {
  readonly acknowledged: true;
}
