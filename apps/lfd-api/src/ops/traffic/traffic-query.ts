import type {
  TrafficSample,
  TrafficSeries,
  TrafficSurface,
  TrafficWindow,
} from "@lfd/ops-contract";

/**
 * La **décision** de lecture d'Analytics Engine : la requête SQL, et la lecture
 * de ses lignes. Pur et testé — l'adaptateur ne fait plus que l'appel HTTP.
 *
 * Même partage que `routes.ts` côté passerelle : ce qui peut se tromper vit
 * ici, sous tests ; ce qui ne peut que transporter vit dans l'adaptateur.
 */

/** Le dataset — même nom que `TRAFFIC_DATASET` dans la gateway. */
export const TRAFFIC_DATASET = "lfc_gateway_traffic";

/** Bornes de fenêtre acceptées, en minutes. Au-delà, la lecture coûte sans servir. */
export const MIN_WINDOW_MINUTES = 1;
export const MAX_WINDOW_MINUTES = 24 * 60;
export const DEFAULT_WINDOW_MINUTES = 60;

/**
 * Ramène une durée de fenêtre demandée par l'appelant à quelque chose de sensé.
 * Une valeur absente, illisible ou hors bornes ne fait **pas** échouer la
 * lecture : OPS est un écran de diagnostic, pas un formulaire — refuser une
 * requête parce que le paramètre est bancal remplacerait une information
 * approximative par aucune information.
 */
export function resolveWindowMinutes(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_WINDOW_MINUTES;
  }
  return Math.min(MAX_WINDOW_MINUTES, Math.max(MIN_WINDOW_MINUTES, parsed));
}

/**
 * La requête d'agrégation, un `GROUP BY` par nœud.
 *
 * Deux choix que la doc d'Analytics Engine impose et que le SQL rend visibles :
 *
 *  - **`sum(_sample_interval)` et non `count()`** — AE échantillonne quand le
 *    volume monte et porte le poids de chaque point dans cette colonne. Un
 *    `count()` rendrait le nombre de points conservés.
 *  - **`quantileExactWeighted`** — le quantile pondéré du même poids. Non
 *    pondéré, il mentirait vers le bas dès le premier délestage : il rassurerait
 *    au moment exact où on le consulte pour s'inquiéter.
 *
 * `minutes` est un entier déjà borné par {@link resolveWindowMinutes} : rien
 * d'extérieur n'entre dans cette chaîne (AE n'a pas de requête paramétrée).
 */
export function trafficQuery(minutes: number): string {
  return [
    "SELECT index1 AS node,",
    "  sum(_sample_interval) AS requests,",
    "  sumIf(_sample_interval, blob1 = '5xx' AND blob3 = 'upstream') AS serverErrors,",
    "  sumIf(_sample_interval, blob1 = '429') AS throttled,",
    "  sumIf(_sample_interval, blob3 = 'gateway') AS gatewayFaults,",
    "  quantileExactWeighted(0.95)(double1, _sample_interval) AS p95Ms",
    `FROM ${TRAFFIC_DATASET}`,
    `WHERE timestamp > NOW() - INTERVAL '${Math.trunc(minutes)}' MINUTE`,
    "GROUP BY node",
    "FORMAT JSON",
  ].join("\n");
}

/** Une ligne du `FORMAT JSON` d'Analytics Engine — tout y est potentiellement texte. */
export interface TrafficRow {
  readonly node?: unknown;
  readonly requests?: unknown;
  readonly serverErrors?: unknown;
  readonly throttled?: unknown;
  readonly gatewayFaults?: unknown;
  readonly p95Ms?: unknown;
}

/**
 * Un nombre, quel que soit ce qu'AE a rendu. Les agrégats reviennent tantôt en
 * nombre, tantôt en chaîne selon la fonction ; un `NaN` qui remonterait jusqu'à
 * l'écran s'y afficherait sans qu'on sache d'où il vient.
 */
function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Les lignes en fenêtres. Les bornes viennent de l'appelant et **pas** de la
 * réponse : une fenêtre doit dire ce qu'elle couvre même quand AE ne rend
 * aucune ligne — c'est-à-dire précisément quand il n'y a eu aucun trafic, le
 * cas qu'on veut pouvoir distinguer d'une panne de lecture.
 */
export function rowsToWindows(
  rows: readonly TrafficRow[],
  bounds: { readonly from: string; readonly to: string },
): readonly TrafficWindow[] {
  return rows.flatMap((row) => {
    const { node } = row;
    // Écarté plutôt que rebaptisé : une ligne sans nœud ne se rattache à rien,
    // et lui inventer un nom la ferait entrer dans la carte sous une identité
    // fausse.
    if (typeof node !== "string" || node === "") {
      return [];
    }
    return [
      {
        node,
        from: bounds.from,
        to: bounds.to,
        requests: toNumber(row.requests),
        serverErrors: toNumber(row.serverErrors),
        throttled: toNumber(row.throttled),
        gatewayFaults: toNumber(row.gatewayFaults),
        p95Ms: Math.round(toNumber(row.p95Ms)),
      },
    ];
  });
}

/**
 * Combien de **surfaces** on ramène, tous nœuds confondus.
 *
 * Une borne, et elle est dite : la queue d'une distribution de routes est
 * longue et sans intérêt — on vient sur cet écran pour les quelques appels qui
 * pèsent, pas pour l'inventaire. L'écran annonce qu'il montre les plus
 * sollicitées ; une troncature silencieuse laisserait croire à un inventaire.
 */
export const SURFACES_LIMIT = 60;

/**
 * La même fenêtre, découpée par **surface appelée** — ce qui répond à « quelles
 * requêtes prennent la charge ».
 *
 * La surface est celle que la gateway a écrite : au plus deux segments, et tout
 * segment porteur d'un chiffre remplacé par `_`. On lit donc `admin/companies`,
 * jamais `admin/companies/cmsz…/contacts`. Ce n'est pas une limite technique,
 * c'est la décision du J1 : un identifiant en dimension, c'est la cardinalité
 * qui explose ET de la donnée client déposée dehors.
 */
export function surfacesQuery(minutes: number): string {
  return [
    "SELECT index1 AS node,",
    "  blob2 AS surface,",
    "  sum(_sample_interval) AS requests,",
    "  sumIf(_sample_interval, blob1 = '5xx' AND blob3 = 'upstream') AS serverErrors,",
    "  sumIf(_sample_interval, blob1 = '429') AS throttled,",
    "  sumIf(_sample_interval, blob3 = 'gateway') AS gatewayFaults,",
    "  quantileExactWeighted(0.95)(double1, _sample_interval) AS p95Ms",
    `FROM ${TRAFFIC_DATASET}`,
    `WHERE timestamp > NOW() - INTERVAL '${Math.trunc(minutes)}' MINUTE`,
    "GROUP BY node, surface",
    "ORDER BY requests DESC",
    `LIMIT ${SURFACES_LIMIT}`,
    "FORMAT JSON",
  ].join("\n");
}

/** Une ligne du découpage par surface. */
export interface SurfaceRow extends TrafficRow {
  readonly surface?: unknown;
}

/**
 * Range les surfaces **par nœud**. Une ligne sans nœud ou sans surface est
 * écartée plutôt que rebaptisée : lui inventer un nom la ferait entrer dans le
 * tableau sous une identité fausse, et c'est un tableau qu'on lit pour décider
 * où regarder.
 */
export function rowsToSurfaces(
  rows: readonly SurfaceRow[],
): ReadonlyMap<string, readonly TrafficSurface[]> {
  const byNode = new Map<string, TrafficSurface[]>();
  for (const row of rows) {
    const { node, surface } = row;
    if (typeof node !== "string" || node === "" || typeof surface !== "string" || surface === "") {
      continue;
    }
    const entry: TrafficSurface = {
      surface,
      requests: toNumber(row.requests),
      serverErrors: toNumber(row.serverErrors),
      throttled: toNumber(row.throttled),
      gatewayFaults: toNumber(row.gatewayFaults),
      p95Ms: Math.round(toNumber(row.p95Ms)),
    };
    byNode.set(node, [...(byNode.get(node) ?? []), entry]);
  }
  return byNode;
}

/**
 * **L'histoire** : vingt-quatre heures découpées en tranches d'une demi-heure.
 *
 * Vingt-quatre heures parce que la question qu'on se pose devant une carte n'est
 * pas « combien » mais « **est-ce pire que tout à l'heure** » — et qu'un cycle
 * de journée est le plus court intervalle qui rende la comparaison honnête : à
 * six heures, on prend un creux de nuit pour une amélioration.
 *
 * Quarante-huit points : assez pour qu'une bosse se voie, assez peu pour tenir
 * dans une vignette de soixante unités de large.
 */
export const HISTORY_MINUTES = 24 * 60;
export const HISTORY_BUCKET_SECONDS = 30 * 60;

/**
 * Le regroupement en tranches est écrit en `intDiv(toUInt32(timestamp), n) * n`
 * plutôt qu'avec `toStartOfInterval` : Analytics Engine n'expose qu'un
 * sous-ensemble de ClickHouse, et cette forme-là n'utilise que de l'arithmétique
 * entière. Une fonction de confort absente ferait échouer la requête entière,
 * donc disparaître la courbe — silencieusement, puisqu'un lecteur qui échoue
 * rend une série vide.
 */
export function seriesQuery(): string {
  return [
    "SELECT index1 AS node,",
    `  intDiv(toUInt32(timestamp), ${HISTORY_BUCKET_SECONDS}) * ${HISTORY_BUCKET_SECONDS} AS bucket,`,
    "  sum(_sample_interval) AS requests,",
    "  sumIf(_sample_interval, (blob1 = '5xx' AND blob3 = 'upstream') OR blob3 = 'gateway') AS failures",
    `FROM ${TRAFFIC_DATASET}`,
    `WHERE timestamp > NOW() - INTERVAL '${HISTORY_MINUTES}' MINUTE`,
    "GROUP BY node, bucket",
    "ORDER BY bucket",
    "FORMAT JSON",
  ].join("\n");
}

/** Une ligne de la requête d'histoire. */
export interface SeriesRow {
  readonly node?: unknown;
  readonly bucket?: unknown;
  readonly requests?: unknown;
  readonly failures?: unknown;
}

/**
 * Regroupe les tranches par nœud, en gardant l'ordre chronologique rendu par le
 * `ORDER BY`. Les tranches VIDES ne sont pas comblées : Analytics Engine ne rend
 * que ce qui existe, et inventer des zéros dessinerait une chute là où il n'y a
 * qu'une absence de mesure — exactement le mensonge qu'une courbe rend
 * convaincant.
 */
export function rowsToSeries(rows: readonly SeriesRow[]): readonly TrafficSeries[] {
  const byNode = new Map<string, TrafficSample[]>();
  for (const row of rows) {
    if (typeof row.node !== "string" || row.node === "") {
      continue;
    }
    const points = byNode.get(row.node) ?? [];
    points.push({
      at: new Date(toNumber(row.bucket) * 1000).toISOString(),
      requests: toNumber(row.requests),
      failures: toNumber(row.failures),
    });
    byNode.set(row.node, points);
  }
  return [...byNode.entries()].map(([node, points]) => ({ node, points }));
}
