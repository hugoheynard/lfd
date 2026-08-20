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
 * ⚠️ Les identifiants des deux backends (`b2b`, `pim`) sont **les mêmes** que
 * ceux écrits par la gateway dans Analytics Engine (`index1`). C'est la seule
 * couture entre l'observation et la carte : la rompre ne casserait rien
 * bruyamment — les nœuds passeraient simplement en « aucune preuve », ce qui est
 * beaucoup plus difficile à remarquer.
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
  //
  //   La Suite n'a pas encore d'adresse de production : sans cible, pas de
  //   sonde, et elle reste grise. Grise est exact ; verte serait inventé.
  {
    id: "suite-shell",
    kind: "frontend",
    label: "Suite",
    dependsOn: ["gateway"],
  },
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
    dependsOn: ["postgres-b2b", "r2", "auth0", "stripe", "resend", "shopify"],
  },
  {
    id: "postgres-b2b",
    kind: "datastore",
    label: "Database — LFD",
    dependsOn: [],
    probe: { kind: "postgres" },
  },
  { id: "auth0", kind: "external-api", label: "Auth0", dependsOn: [], probe: { kind: "auth0" } },
  {
    id: "shopify",
    kind: "external-api",
    label: "Shopify",
    dependsOn: [],
    probe: { kind: "shopify" },
  },
  { id: "stripe", kind: "external-api", label: "Stripe", dependsOn: [], probe: { kind: "http" } },
  { id: "resend", kind: "external-api", label: "Resend", dependsOn: [], probe: { kind: "http" } },
  { id: "r2", kind: "datastore", label: "Stockage R2", dependsOn: [], probe: { kind: "http" } },
];

/**
 * Les nœuds que la **passerelle** peut observer : ceux dont l'identifiant est
 * aussi une clé d'index dans Analytics Engine. Les autres n'ont, à ce stade,
 * aucune source — leurs sondes sont l'étape suivante.
 */
export const OBSERVED_BY_GATEWAY: readonly string[] = ["b2b"];
