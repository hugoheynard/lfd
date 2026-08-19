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
  {
    id: "gateway",
    kind: "worker",
    label: "Gateway",
    dependsOn: ["b2b", "pim"],
  },
  {
    id: "b2b",
    kind: "service",
    label: "API B2B",
    dependsOn: ["postgres-b2b", "auth0", "stripe", "resend", "r2"],
  },
  {
    id: "pim",
    kind: "service",
    label: "Référentiel produit",
    dependsOn: ["postgres-pim", "shopify"],
  },
  {
    id: "postgres-b2b",
    kind: "datastore",
    label: "Base B2B",
    dependsOn: [],
    probe: { kind: "postgres" },
  },
  {
    id: "postgres-pim",
    kind: "datastore",
    label: "Base référentiel",
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
export const OBSERVED_BY_GATEWAY: readonly string[] = ["b2b", "pim"];
