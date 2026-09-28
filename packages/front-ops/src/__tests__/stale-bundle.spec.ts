import {
  isStaleBundleError,
  RELOAD_GUARD_KEY,
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

  it("recharge la première fois et note l'instant", () => {
    const store = memoryStore();

    expect(shouldReload(store, NOW)).toBe(true);
    expect(store.values[RELOAD_GUARD_KEY]).toBe(String(NOW));
  });

  it("ne recharge pas une seconde fois dans l'intervalle — pas de boucle", () => {
    const store = memoryStore({ [RELOAD_GUARD_KEY]: String(NOW) });

    expect(shouldReload(store, NOW + RELOAD_GUARD_MS - 1)).toBe(false);
  });

  it("recharge de nouveau une fois l'intervalle passé — un déploiement suivant", () => {
    const store = memoryStore({ [RELOAD_GUARD_KEY]: String(NOW) });

    expect(shouldReload(store, NOW + RELOAD_GUARD_MS)).toBe(true);
  });

  it("tient une valeur illisible pour « jamais rechargé »", () => {
    expect(shouldReload(memoryStore({ [RELOAD_GUARD_KEY]: "abc" }), NOW)).toBe(true);
  });

  it("recharge quand le stockage refuse, plutôt que laisser l'onglet mort", () => {
    expect(shouldReload(refusingStore, NOW)).toBe(true);
    expect(shouldReload(null, NOW)).toBe(true);
  });
});
