import {
  fetchServedBuild,
  DEV_BUILD,
  isNewBuild,
  isReadStale,
  NEW_VERSION_NAVIGATION_READ_MS,
  NEW_VERSION_BANNER,
  newVersionModeOf,
  parseVersionFile,
  readBuildMeta,
  shouldReloadAfterGuards,
  shouldReloadOnNavigation,
  versionFileUrl,
  type MetaReader,
  type RouteDataNode,
  type VersionFetch,
} from "../new-version.js";

function docWith(content: string | null): MetaReader {
  return {
    querySelector: (selector) =>
      content === null || selector !== 'meta[name="lfd-build"]'
        ? null
        : { getAttribute: () => content },
  };
}

function node(
  data: Record<string, unknown>,
  firstChild: RouteDataNode | null = null,
): RouteDataNode {
  return { data, firstChild };
}

describe("readBuildMeta", () => {
  it("lit le build de la balise", () => {
    expect(readBuildMeta(docWith(" abc123 "))).toBe("abc123");
  });

  it.each([null, "", "   "])(
    "rend null sans balise exploitable (%p) — la veille ne démarre pas",
    (content) => {
      expect(readBuildMeta(docWith(content))).toBeNull();
    },
  );
});

describe("parseVersionFile", () => {
  it("lit le build", () => {
    expect(parseVersionFile({ build: "abc" })).toBe("abc");
  });

  it.each([null, "abc", {}, { build: 3 }, { build: "" }])("rend null sur %p", (body) => {
    expect(parseVersionFile(body)).toBeNull();
  });
});

describe("isNewBuild", () => {
  it("même build → rien", () => expect(isNewBuild("a", "a")).toBe(false));
  it("build neuf → oui", () => expect(isNewBuild("a", "b")).toBe(true));
  it("lecture ratée → silence", () => expect(isNewBuild("a", null)).toBe(false));
});

describe("fetchServedBuild", () => {
  it("relit sans cache, avec un paramètre anti-cache", async () => {
    const calls: Array<[string, unknown]> = [];
    const fetchFn: VersionFetch = (url, init) => {
      calls.push([url, init]);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ build: "b" }) });
    };
    await expect(fetchServedBuild(fetchFn, 42)).resolves.toBe("b");
    expect(calls).toEqual([[versionFileUrl(42), { cache: "no-store" }]]);
    expect(versionFileUrl(42)).toBe("/version.json?t=42");
  });

  it("une 404 pendant un déploiement rend null", async () => {
    const fetchFn: VersionFetch = () =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ build: "b" }) });
    await expect(fetchServedBuild(fetchFn, 1)).resolves.toBeNull();
  });

  it("un réseau coupé rend null", async () => {
    const fetchFn: VersionFetch = () => Promise.reject(new TypeError("Failed to fetch"));
    await expect(fetchServedBuild(fetchFn, 1)).resolves.toBeNull();
  });

  it("un corps illisible rend null", async () => {
    const fetchFn: VersionFetch = () =>
      Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("x")) });
    await expect(fetchServedBuild(fetchFn, 1)).resolves.toBeNull();
  });
});

describe("shouldReloadOnNavigation", () => {
  it("pas de version neuve → jamais", () => {
    expect(shouldReloadOnNavigation(false, undefined)).toBe(false);
  });
  it("version neuve, route ordinaire → recharge", () => {
    expect(shouldReloadOnNavigation(true, undefined)).toBe(true);
  });
  it("version neuve, route à bandeau → ne recharge pas", () => {
    expect(shouldReloadOnNavigation(true, NEW_VERSION_BANNER)).toBe(false);
  });
  it("front sans rechargement automatique (back-office) → jamais", () => {
    expect(shouldReloadOnNavigation(true, undefined, { reloadOnNavigation: false })).toBe(false);
  });
  it("rechargement explicitement permis → comme le défaut", () => {
    expect(shouldReloadOnNavigation(true, undefined, { reloadOnNavigation: true })).toBe(true);
  });
});

describe("newVersionModeOf", () => {
  it("lit la feuille", () => {
    expect(newVersionModeOf(node({}, node({}, node({ newVersion: "banner" }))))).toBe("banner");
  });
  it("hérite d'un ancêtre", () => {
    expect(newVersionModeOf(node({}, node({ newVersion: "banner" }, node({}))))).toBe("banner");
  });
  it("rien de posé → undefined", () => {
    expect(newVersionModeOf(node({}, node({})))).toBeUndefined();
  });
});

describe("la valeur de développement", () => {
  it("une balise « dev » n'arme pas la veille", () => {
    expect(readBuildMeta(docWith(DEV_BUILD))).toBeNull();
  });
  it("un fichier servi « dev » n'annonce jamais une version neuve", () => {
    expect(isNewBuild("a", DEV_BUILD)).toBe(false);
    expect(isNewBuild(DEV_BUILD, "a")).toBe(false);
  });
});

describe("isReadStale", () => {
  const NOW = 5_000_000;
  it("jamais lu → relire", () => expect(isReadStale(null, NOW)).toBe(true));
  it("lu à l'instant → ne pas relire", () => {
    expect(isReadStale(NOW - NEW_VERSION_NAVIGATION_READ_MS + 1, NOW)).toBe(false);
  });
  it("lu il y a longtemps → relire", () => {
    expect(isReadStale(NOW - NEW_VERSION_NAVIGATION_READ_MS, NOW)).toBe(true);
  });
});

describe("shouldReloadAfterGuards", () => {
  const passed = { shouldActivate: true, skipLocationChange: false, targetMode: undefined };

  it("gardes passées, version neuve → recharge", () => {
    expect(shouldReloadAfterGuards(true, passed)).toBe(true);
  });
  it("une garde refuse (formulaire non enregistré) → ne recharge pas", () => {
    expect(shouldReloadAfterGuards(true, { ...passed, shouldActivate: false })).toBe(false);
  });
  it("même version → ne recharge pas", () => {
    expect(shouldReloadAfterGuards(false, passed)).toBe(false);
  });
  it("navigation qui ne touche pas l'adresse (détour de bascule) → ne recharge pas", () => {
    expect(shouldReloadAfterGuards(true, { ...passed, skipLocationChange: true })).toBe(false);
  });
  it("route à bandeau → ne recharge pas", () => {
    expect(shouldReloadAfterGuards(true, { ...passed, targetMode: NEW_VERSION_BANNER })).toBe(
      false,
    );
  });
});
