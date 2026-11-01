/**
 * **Une opération après déploiement** — une reprise de données qu'un
 * déploiement laisse à faire, montrée et déclenchée par `ops`
 * (`documentation/ops/plan-operations-apres-deploiement.md`, § 3 et § 7).
 *
 * Déclarée ICI parce que `platform/` est le seul endroit que le commerce
 * (qui l'implémente) et `ops` (qui la conduit) lisent tous deux : `ops`
 * n'importe aucun bloc métier, et personne n'importe `ops`. La racine de
 * composition relie la liste (`appBootstrap/post-deploy-operations.module.ts`).
 *
 * Chaque implémentation enveloppe une reprise existante, rejouable ligne à
 * ligne : une ligne déjà reprise n'est plus candidate.
 */
export abstract class PostDeployOperation {
  /** Stable : identifiant dans les routes et la trace. Ne se renomme pas. */
  abstract readonly key: string;
  /** Le titre de la carte. */
  abstract readonly title: string;
  /** Pourquoi elle existe, pour qui la lit sans le code. */
  abstract readonly why: string;
  /** Ce qu'elle ne sait pas défaire — dit avant « Appliquer » (§ 7.10). */
  abstract readonly limit: string;
  /**
   * Les clés des opérations qui doivent être faites avant elle (§ 7.1) :
   * elle ne s'applique pas tant que l'une d'elles est à faire.
   */
  abstract readonly after: readonly string[];

  /** Lecture seule : ce que l'application ferait. N'écrit rien. */
  abstract simulate(): Promise<OperationReport>;

  /**
   * Écrit, **par lots** : chaque lot dans sa ou ses transactions, puis
   * `progress` avec le rapport cumulé. Rend le rapport final.
   *
   * L'auteur est la fiche staff qui a cliqué ; une opération qui écrit un
   * fait l'y nomme (§ 7.5).
   */
  abstract apply(run: PostDeployApplication): Promise<OperationReport>;
}

/** Ce que l'application reçoit de celui qui la conduit. */
export interface PostDeployApplication {
  /** L'id de la fiche staff qui applique. */
  readonly actor: string;
  /** Appelé après chaque lot, avec le rapport cumulé. */
  readonly progress: (report: OperationReport) => Promise<void>;
}

/**
 * **Le rapport d'une simulation ou d'une application** : des comptes et des
 * phrases, jamais une donnée personnelle (§ 3.1).
 */
export interface OperationReport {
  /**
   * Les décisions écrivables (simulation) ou écrites (application). En
   * simulation, `> 0` = l'opération est **à faire** (§ 7.2).
   */
  readonly writable: number;
  /** Les cas que la reprise ne sait pas trancher : listés, ils ne tiennent pas l'opération ouverte. */
  readonly byHand: number;
  /** Les comptes, en phrases. */
  readonly summary: readonly string[];
  /** Un échantillon lisible des lignes, borné. */
  readonly sample: readonly string[];
}

/** Le jeton de la liste injectée, dans l'ordre d'affichage. */
export const POST_DEPLOY_OPERATIONS = Symbol("POST_DEPLOY_OPERATIONS");

/** La borne de l'échantillon d'un rapport. */
export const REPORT_SAMPLE_LIMIT = 30;
