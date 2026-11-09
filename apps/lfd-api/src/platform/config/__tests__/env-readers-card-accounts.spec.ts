import { optionalCardAccountSecrets } from "../env-readers.js";

/**
 * Ce test écrit `process.env` — il est dans les deux listes admises (ESLint
 * et `lint:no-direct-env`), comme ses voisins, parce qu'il vérifie le
 * lecteur qui en a le monopole. Des noms à lui, jamais ceux d'un vrai
 * compte ; restaurés après chaque cas.
 */
const ENV = {
  secretKey: "TEST_CARD_SECRET_KEY",
  publishableKey: "TEST_CARD_PUBLISHABLE_KEY",
  webhookSecret: "TEST_CARD_WEBHOOK_SECRET",
} as const;
const NAMES = Object.values(ENV);

describe("optionalCardAccountSecrets", () => {
  let saved: (string | undefined)[] = [];

  beforeEach(() => {
    saved = NAMES.map((name) => process.env[name]);
  });

  afterEach(() => {
    NAMES.forEach((name, index) => {
      const value = saved[index];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    });
  });

  function set(values: readonly (string | undefined)[]): void {
    NAMES.forEach((name, index) => {
      const value = values[index];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    });
  }

  it("lit les trois secrets sous les noms que le registre déclare, nettoyés", () => {
    set([" sk_x ", "pk_x", "whsec_x"]);
    expect(optionalCardAccountSecrets(ENV)).toEqual({
      secretKey: "sk_x",
      publishableKey: "pk_x",
      webhookSecret: "whsec_x",
    });
  });

  /**
   * La différence avec `optionalStripeConfig`, voulue (plan M2, §3.2) : un
   * compte à moitié configuré n'est pas instancié, il ne fait pas tomber le
   * démarrage.
   */
  it.each([
    ["aucun", [undefined, undefined, undefined]],
    ["deux sur trois", ["sk_x", "pk_x", undefined]],
    ["un vide", ["sk_x", "  ", "whsec_x"]],
  ] as const)("%s : `null`, sans lever", (_, values) => {
    set(values);
    expect(optionalCardAccountSecrets(ENV)).toBeNull();
  });
});
