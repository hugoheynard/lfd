import type { HeartbeatMetrics } from "./heartbeat.js";
import type { HealthStatus, NodeKind } from "./node.js";

/**
 * **Pourquoi** un nœud porte ce statut. Le statut seul ne se conteste pas : il
 * s'accepte ou s'ignore. La raison, elle, se vérifie — et c'est ce qui fait la
 * différence entre un tableau qu'on regarde et un tableau qu'on croit.
 *
 * `no-evidence` est le plus important à nommer : ni trafic, ni battement
 * attendu. Ce n'est pas une panne, c'est un angle mort — et le confondre avec
 * une panne est la première façon de perdre confiance en sa propre carte.
 */
/**
 * **Un relevé** — un chiffre que ce nœud, et lui seul, sait produire.
 *
 * C'est le champ qui permet à chaque brique de dire ce qui la concerne sans que
 * le contrat ait à connaître aucune d'elles : la gateway sort des requêtes par
 * seconde, un stockage des opérations par classe, un courrier des envois par
 * catégorie. Générique ici, spécifique chez le producteur — un nœud ajouté
 * demain amène ses relevés, et l'écran n'apprend rien de nouveau.
 *
 * `hint` porte ce qu'un libellé ne peut pas dire : ce qu'est une classe A, ce
 * que compte exactement une catégorie. Un tableau de bord dont les intitulés
 * demandent une note de service ailleurs n'est pas consultable.
 */
export interface NodeReading {
  readonly label: string;
  readonly value: number;
  /** Suffixe affiché tel quel (`/s`, `ms`, `%`). Absent ⇒ un décompte nu. */
  readonly unit?: string;
  readonly hint?: string;
}

export type HealthReason =
  | "gateway-fault"
  | "error-rate"
  | "traffic-healthy"
  | "heartbeat-stale"
  | "heartbeat-fresh"
  | "no-evidence";

/**
 * Ce que OPS **rend** pour un nœud — agrégé, jamais poussé tel quel. Le `status`
 * est **dérivé** (heartbeat récent vs périmé, seuils, propagation d'une dépendance
 * `down`), pas la copie brute du dernier heartbeat.
 */
export interface NodeHealth {
  readonly node: string;
  readonly kind: NodeKind;
  readonly label: string;
  readonly status: HealthStatus;
  /** Depuis quand ce `status` tient (ISO). */
  readonly since: string;
  /** Dernier heartbeat reçu, ou `null` si le nœud n'a jamais parlé. */
  readonly lastHeartbeatAt: string | null;
  readonly dependsOn: readonly string[];
  /** Ce qui a produit ce `status` — vérifiable, contrairement au statut seul. */
  readonly reason: HealthReason;
  /**
   * Une dépendance **déclarée `down`**, s'il y en a une.
   *
   * Elle n'altère PAS le `status` du nœud : un nœud que le trafic prouve vivant
   * reste `up` même si ce dont il dépend est tombé — c'est un fait, pas une
   * opinion. Propager le rouge peindrait toute la carte à partir d'un seul
   * incident et **cacherait la cause au lieu de la montrer**. On expose donc le
   * lien, et l'écran décide de le souligner.
   */
  readonly dependencyDown?: string;
  /** Ce que CE nœud sait dire de son activité. Vide quand rien ne le mesure. */
  readonly readings: readonly NodeReading[];
  readonly metrics?: HeartbeatMetrics;
  readonly lastError?: { readonly at: string; readonly message: string };
}

/**
 * L'état de tout l'écosystème à un instant — le « board » que l'app OPS rend en
 * schéma live. `generatedAt` = l'instant du snapshot (utile pour repérer un flux
 * figé côté UI).
 */
export interface EcosystemHealth {
  readonly generatedAt: string;
  readonly nodes: readonly NodeHealth[];
}
