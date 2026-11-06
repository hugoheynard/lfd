import {
  isStaleBundleError,
  reloadGuardKey,
  reloadTargetOf,
  RELOAD_GUARD_MS,
  shouldReload,
  type ReloadGuardStore,
} from "../stale-bundle.js";

function memoryStore(initial: Record<string, string> = {}): ReloadGuardStore & {
  readonly values: Record<string, string>;
} {
  const values = { ...initial };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
  };
}

const refusingStore: ReloadGuardStore = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
};

describe("isStaleBundleError", () => {
  /**
   * Régression : le 2026-09-28, un onglet du back-office ouvert avant un
   * déploiement demandait des morceaux retirés ; l'import échouait et la
   * personne se disait « bloquée », sans qu'aucun journal ne le voie.
   */
  it.each([
    ["Chromium", "Failed to fetch dynamically imported module: https://x/chunk-AB12.js"],
    ["Firefox", "error loading dynamically imported module: https://x/chunk-AB12.js"],
    ["Safari", "Importing a module script failed."],
  ])("reconnaît le message de %s", (_engine, message) => {
    expect(isStaleBundleError(new TypeError(message))).toBe(true);
  });

  it("reconnaît une raison de rejet donnée en chaîne", () => {
    expect(isStaleBundleError("Importing a module script failed.")).toBe(true);
  });

  it.each([
    ["une autre erreur", new Error("Cannot read properties of undefined")],
    ["une réponse HTTP refusée", new Error("Http failure response: 403")],
    ["null", null],
    ["un objet sans message", { reason: "Failed to fetch dynamically imported module" }],
  ])("ignore %s", (_label, error) => {
    expect(isStaleBundleError(error)).toBe(false);
  });
});

describe("shouldReload", () => {
  const NOW = 1_000_000;
  const TARGET = "/commandes";
  const KEY = reloadGuardKey(TARGET);

  it("recharge la première fois et note l'instant", () => {
    const store = memoryStore();

    expect(shouldReload(store, NOW, TARGET)).toBe(true);
    expect(store.values[KEY]).toBe(String(NOW));
  });

  it("ne recharge pas une seconde fois dans l'intervalle — pas de boucle", () => {
    const store = memoryStore({ [KEY]: String(NOW) });

    expect(shouldReload(store, NOW + RELOAD_GUARD_MS - 1, TARGET)).toBe(false);
  });

  it("recharge de nouveau une fois l'intervalle passé — un déploiement suivant", () => {
    const store = memoryStore({ [KEY]: String(NOW) });

    expect(shouldReload(store, NOW + RELOAD_GUARD_MS, TARGET)).toBe(true);
  });

  it("tient une valeur illisible pour « jamais rechargé »", () => {
    expect(shouldReload(memoryStore({ [KEY]: "abc" }), NOW, TARGET)).toBe(true);
  });

  it("recharge quand le stockage refuse, plutôt que laisser l'onglet mort", () => {
    expect(shouldReload(refusingStore, NOW, TARGET)).toBe(true);
    expect(shouldReload(null, NOW, TARGET)).toBe(true);
  });

  it("tient sa garde PAR ADRESSE — un autre écran se recharge encore", () => {
    const store = memoryStore({ [KEY]: String(NOW) });

    expect(shouldReload(store, NOW + 1, "/compte")).toBe(true);
    expect(shouldReload(store, NOW + 2, TARGET)).toBe(false);
  });
});

describe("reloadTargetOf", () => {
  it("vise l'adresse demandée d'une navigation ordinaire", () => {
    expect(reloadTargetOf("/commandes", false, "/accueil")).toBe("/commandes");
  });

  /**
   * Régression : la bascule d'espace de la boutique traverse
   * `/changement-d-espace` sans toucher à l'adresse ; le charger en entier
   * laissait la personne devant un écran vide (2026-11-06).
   */
  it("recharge l'adresse affichée quand la navigation ne touche pas l'adresse", () => {
    expect(reloadTargetOf("/changement-d-espace", true, "/catalogue?x=1")).toBe("/catalogue?x=1");
  });
});
