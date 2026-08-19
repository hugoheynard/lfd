import {
  DEFAULT_WINDOW_MINUTES,
  HISTORY_BUCKET_SECONDS,
  rowsToSeries,
  seriesQuery,
  rowsToSurfaces,
  surfacesQuery,
  SURFACES_LIMIT,
  MAX_WINDOW_MINUTES,
  MIN_WINDOW_MINUTES,
  resolveWindowMinutes,
  rowsToWindows,
  trafficQuery,
} from "../traffic-query.js";

/**
 * La lecture d'Analytics Engine est **pure et testée** ; l'adaptateur ne fait
 * plus que l'appel HTTP. Ce qui se joue ici n'est pas de la syntaxe SQL : ce
 * sont deux façons de mentir avec des chiffres justes.
 */

describe("trafficQuery — les deux pièges d'Analytics Engine", () => {
  it("compte avec `_sample_interval`, jamais avec `count()`", () => {
    // AE échantillonne quand le volume monte. Un `count()` rendrait le nombre
    // de points CONSERVÉS : un chiffre exact, réponse à une autre question — et
    // d'autant plus faux que le trafic est fort, donc au pire moment.
    const sql = trafficQuery(60);

    expect(sql).toContain("sum(_sample_interval) AS requests");
    expect(sql).not.toContain("count(");
  });

  it("pondère le quantile du même poids", () => {
    // Non pondéré, le p95 ment VERS LE BAS dès le premier délestage : il
    // rassure au moment exact où on le consulte pour s'inquiéter.
    expect(trafficQuery(60)).toContain(
      "quantileExactWeighted(0.95)(double1, _sample_interval) AS p95Ms",
    );
  });

  it("sépare l'erreur amont de l'absence de réponse", () => {
    const sql = trafficQuery(60);

    expect(sql).toContain("blob1 = '5xx' AND blob3 = 'upstream'");
    expect(sql).toContain("blob3 = 'gateway'");
  });

  it("n'interpole qu'un entier dans la clause temporelle", () => {
    // AE n'a pas de requête paramétrée : la seule protection est que `minutes`
    // soit déjà borné et tronqué. Le vérifier ici plutôt que d'y compter.
    expect(trafficQuery(90.7)).toContain("INTERVAL '90' MINUTE");
  });
});

describe("resolveWindowMinutes", () => {
  it("retombe sur le défaut plutôt que de refuser", () => {
    // OPS est un écran de diagnostic : refuser la requête parce que le
    // paramètre est bancal remplacerait une information approximative par
    // aucune information.
    expect(resolveWindowMinutes(undefined)).toBe(DEFAULT_WINDOW_MINUTES);
    expect(resolveWindowMinutes("")).toBe(DEFAULT_WINDOW_MINUTES);
    expect(resolveWindowMinutes("beaucoup")).toBe(DEFAULT_WINDOW_MINUTES);
  });

  it("borne des deux côtés", () => {
    expect(resolveWindowMinutes("0")).toBe(MIN_WINDOW_MINUTES);
    expect(resolveWindowMinutes("-5")).toBe(MIN_WINDOW_MINUTES);
    expect(resolveWindowMinutes("999999")).toBe(MAX_WINDOW_MINUTES);
    expect(resolveWindowMinutes("15")).toBe(15);
  });
});

describe("rowsToWindows", () => {
  const bounds = { from: "2026-08-19T11:00:00.000Z", to: "2026-08-19T12:00:00.000Z" };

  it("lit les agrégats rendus en TEXTE", () => {
    // AE rend tantôt un nombre, tantôt une chaîne selon la fonction. Un `NaN`
    // qui remonterait jusqu'à l'écran s'y afficherait sans qu'on sache d'où il
    // vient.
    const [window] = rowsToWindows(
      [
        {
          node: "b2b",
          requests: "1200",
          serverErrors: "3",
          throttled: "11",
          gatewayFaults: "0",
          p95Ms: "184.6",
        },
      ],
      bounds,
    );

    expect(window).toEqual({
      node: "b2b",
      from: bounds.from,
      to: bounds.to,
      requests: 1200,
      serverErrors: 3,
      throttled: 11,
      gatewayFaults: 0,
      p95Ms: 185,
    });
  });

  it("remplace l'illisible par zéro plutôt que de propager un NaN", () => {
    const [window] = rowsToWindows([{ node: "pim", requests: null, p95Ms: "n/a" }], bounds);

    expect(window?.requests).toBe(0);
    expect(window?.p95Ms).toBe(0);
  });

  it("écarte une ligne sans nœud", () => {
    expect(rowsToWindows([{ requests: "10" }, { node: "", requests: "10" }], bounds)).toEqual([]);
  });

  it("porte les bornes de l'appelant, pas celles de la réponse", () => {
    // Une fenêtre doit dire ce qu'elle couvre même quand AE ne rend rien —
    // c'est-à-dire précisément quand il n'y a eu aucun trafic, le cas qu'on
    // veut distinguer d'une panne de lecture.
    expect(rowsToWindows([], bounds)).toEqual([]);
  });
});

describe("surfacesQuery — quelles requêtes prennent la charge", () => {
  it("découpe par nœud ET par surface", () => {
    const sql = surfacesQuery(60);

    expect(sql).toContain("blob2 AS surface");
    expect(sql).toContain("GROUP BY node, surface");
  });

  it("borne le nombre de lignes, et les rend par charge décroissante", () => {
    // La queue d'une distribution de routes est longue et sans intérêt : on
    // vient ici pour les quelques appels qui pèsent. La borne est DITE côté
    // écran — une troncature silencieuse laisserait croire à un inventaire.
    const sql = surfacesQuery(60);

    expect(sql).toContain("ORDER BY requests DESC");
    expect(sql).toContain(`LIMIT ${SURFACES_LIMIT}`);
  });

  it("compte comme la requête d'ensemble", () => {
    // Deux façons de compter dans un même écran, et les totaux ne colleraient
    // plus avec le détail — c'est ce qui fait douter d'un tableau de bord.
    expect(surfacesQuery(60)).toContain("sum(_sample_interval) AS requests");
  });
});

describe("rowsToSurfaces", () => {
  it("range les surfaces sous leur nœud", () => {
    const byNode = rowsToSurfaces([
      { node: "b2b", surface: "orders", requests: "900", p95Ms: "40" },
      { node: "b2b", surface: "admin/companies", requests: "120", p95Ms: "310" },
      { node: "pim", surface: "catalogue/products", requests: "50", p95Ms: "80" },
    ]);

    expect(byNode.get("b2b")?.map((entry) => entry.surface)).toEqual(["orders", "admin/companies"]);
    expect(byNode.get("pim")).toHaveLength(1);
  });

  it("écarte une ligne sans nœud ou sans surface plutôt que de la rebaptiser", () => {
    // Lui inventer un nom la ferait entrer dans le tableau sous une identité
    // fausse — et c'est un tableau qu'on lit pour décider où regarder.
    const byNode = rowsToSurfaces([
      { surface: "orders", requests: "1" },
      { node: "b2b", requests: "1" },
      { node: "b2b", surface: "", requests: "1" },
    ]);

    expect(byNode.size).toBe(0);
  });
});

describe("l'histoire du trafic", () => {
  it("regroupe en tranches avec de l'arithmétique entière, pas une fonction de confort", () => {
    // Analytics Engine n'expose qu'un sous-ensemble de ClickHouse. Une fonction
    // absente ferait échouer la requête entière, donc disparaître la courbe —
    // silencieusement, puisqu'un lecteur qui échoue rend une série vide.
    const sql = seriesQuery();

    expect(sql).toContain(`intDiv(toUInt32(timestamp), ${HISTORY_BUCKET_SECONDS})`);
    expect(sql).toContain("ORDER BY bucket");
  });

  it("exclut les 429 des échecs, ici comme partout", () => {
    // Le throttler qui refuse est le système qui fonctionne. Une bosse rouge à
    // chaque rafale de rejets apprendrait à ignorer la courbe.
    expect(seriesQuery()).not.toContain("429");
  });

  it("range les tranches par nœud, en gardant l'ordre chronologique", () => {
    const series = rowsToSeries([
      { node: "b2b", bucket: 1_755_600_000, requests: "10", failures: "0" },
      { node: "b2b", bucket: 1_755_601_800, requests: "20", failures: "2" },
      { node: "pim", bucket: 1_755_600_000, requests: "5", failures: "0" },
    ]);

    expect(series.map((one) => one.node)).toEqual(["b2b", "pim"]);
    expect(series[0]?.points.map((point) => point.requests)).toEqual([10, 20]);
    expect(series[0]?.points[0]?.at).toBe(new Date(1_755_600_000 * 1000).toISOString());
  });

  it("ignore une ligne sans nœud plutôt que d'inventer un seau", () => {
    expect(rowsToSeries([{ bucket: 1, requests: 3 }])).toEqual([]);
  });
});
