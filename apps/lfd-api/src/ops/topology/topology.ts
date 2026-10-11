import { PROD_FRONT_ORIGINS } from "@lfd/endpoints";
import type { NodeManifest } from "@lfd/ops-contract";

/**
 * **La carte, déclarée.** Les nœuds et les arêtes de l'écosystème sont écrits
 * ici et versionnés — jamais devinés du trafic.
 *
 * C'est une décision, pas une commodité. Une topologie inférée change toute
 * seule : une brique qui cesse d'être appelée disparaît de la carte au moment
 * précis où sa disparition est l'information. Déclarée, son absence de trafic
 * devient visible au lieu d'être silencieuse.
 *
 * L'arête se lit « **dépend de** » : `b2b` dépend de sa base, la gateway
 * dépend des deux backends qu'elle route. C'est le sens qui rend la causalité
 * lisible de l'amont vers l'aval.
 *
 * ⚠️ La gateway n'écrit PAS ces identifiants dans Analytics Engine (`index1`) :
 * elle écrit sa clé de routage (`lfd`). La couture est la table
 * {@link GATEWAY_TRAFFIC_NODES}, et elle seule. La rompre ne casse rien
 * bruyamment — les nœuds passent en « aucune preuve », ce qui est beaucoup plus
 * difficile à remarquer. C'est arrivé : jusqu'au 2026-10-11, la carte attendait
 * `b2b` alors que la gateway écrivait `lfd` depuis le renommage du préfixe.
 */
export const TOPOLOGY: readonly NodeManifest[] = [
  // ▸ CE QU'ON OUVRE — les quatre fronts. On entre dans le système par eux, et
  //   la gateway ne les voit JAMAIS : ce sont des Pages statiques, elles
  //   l'appellent, elles ne la traversent pas. Aucun trafic ne prouvera donc
  //   qu'un front est servi — d'où la sonde, seule source possible ici.
  //
  //   Leur `target` est l'origine publique tenue dans `@lfd/endpoints`, la même
  //   que l'allowlist CORS. Une seule vérité : si un projet Pages est renommé,
  //   les deux bougent ensemble ou aucun ne bouge — c'est précisément la panne
  //   silencieuse qu'a coûtée `lfc-b2b` → `lfc-b2b-eu7`.
  {
    id: "b2b-front",
    kind: "frontend",
    label: "Boutique PRO",
    dependsOn: ["gateway"],
    probe: { kind: "frontend", target: PROD_FRONT_ORIGINS.b2bFront },
  },
  {
    id: "b2b-admin-front",
    kind: "frontend",
    label: "Back-office",
    dependsOn: ["gateway"],
    probe: { kind: "frontend", target: PROD_FRONT_ORIGINS.b2bAdminFront },
  },

  {
    id: "gateway",
    kind: "worker",
    label: "Gateway",
    dependsOn: ["b2b"],
  },
  {
    // Une seule API depuis B2c : le référentiel n'est plus un service, c'est un
    // bloc de celui-ci. Sa charge n'a pas disparu de la carte, elle a changé
    // d'échelle — elle se lit dans les SURFACES (`pim/…`) du tableau de charge,
    // où elle devient comparable aux autres modules au lieu de vivre à part.
    id: "b2b",
    kind: "service",
    label: "API",
    dependsOn: ["postgres-b2b", "r2", "auth0", "stripe", "resend"],
  },
  {
    id: "postgres-b2b",
    kind: "datastore",
    label: "Database — LFD",
    dependsOn: [],
    probe: { kind: "postgres" },
  },
  { id: "auth0", kind: "external-api", label: "Auth0", dependsOn: [], probe: { kind: "auth0" } },
  { id: "stripe", kind: "external-api", label: "Stripe", dependsOn: [], probe: { kind: "http" } },
  { id: "resend", kind: "external-api", label: "Resend", dependsOn: [], probe: { kind: "http" } },
  {
    id: "r2",
    kind: "object-storage",
    label: "Stockage R2",
    dependsOn: [],
    probe: { kind: "http" },
  },
];

/**
 * **La couture entre la gateway et la carte** : clé de routage écrite dans
 * Analytics Engine (`API_PREFIXES` de `gateway/src/routes.ts`) → nœud de la
 * topologie. Déclarée, jamais devinée, pour la même raison que la carte.
 *
 * `pro` (la boutique servie par la zone) n'y est PAS, délibérément (vérifié le
 * 2026-10-11) : la gateway enregistre ses redirections `/pro → /` en origine
 * `gateway`, que la lecture compte comme des fautes de passerelle — rattachées
 * au front, elles le feraient tomber à chaque redirection.
 */
export const GATEWAY_TRAFFIC_NODES: ReadonlyMap<string, string> = new Map([["lfd", "b2b"]]);

/** Les nœuds que la passerelle observe. */
export const OBSERVED_BY_GATEWAY: readonly string[] = [...GATEWAY_TRAFFIC_NODES.values()];

/**
 * Le nœud de la carte que désigne une clé de la gateway. Une clé hors table
 * (`routePlanner`, `unrouted`, `dev`) garde son nom : elle reste lisible dans
 * le tableau de charge sans entrer dans la carte sous une identité empruntée.
 */
export function topologyNodeOf(gatewayKey: string): string {
  return GATEWAY_TRAFFIC_NODES.get(gatewayKey) ?? gatewayKey;
}
