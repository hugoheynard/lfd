import {
  DEFAULT_WINDOW_MINUTES,
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
