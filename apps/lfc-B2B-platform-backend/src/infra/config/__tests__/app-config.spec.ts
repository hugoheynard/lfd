import { AppConfig } from "../app-config.js";

/**
 * Ce test lit et écrit `process.env` — il fait partie de l'allowlist ESLint
 * (cf. `eslint.config.mjs`) car il vérifie précisément la passerelle qui, elle,
 * en a le monopole. On restaure les clés touchées après chaque cas pour ne pas
 * contaminer les autres suites (env partagé, `--runInBand`).
 */
const TOUCHED = ["AUTH_DEV_IMPERSONATE", "AUTH_DEV_IMPERSONATE_SUBJECT", "NODE_ENV"] as const;

describe("AppConfig — impersonation de dev", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of TOUCHED) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of TOUCHED) {
      const value = saved[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("désactivée par défaut (flag absent) → null", () => {
    expect(new AppConfig().devImpersonation()).toBeNull();
  });

  it("active en dev renvoie le sujet par défaut", () => {
    process.env["NODE_ENV"] = "development";
    process.env["AUTH_DEV_IMPERSONATE"] = "true";
    process.env["AUTH_DEV_IMPERSONATE_SUBJECT"] = "hheynard@gmail.com";

    expect(new AppConfig().devImpersonation()).toEqual({ subject: "hheynard@gmail.com" });
  });

  it("active sans sujet → subject null (l'en-tête devient obligatoire)", () => {
    process.env["NODE_ENV"] = "development";
    process.env["AUTH_DEV_IMPERSONATE"] = "true";

    expect(new AppConfig().devImpersonation()).toEqual({ subject: null });
  });

  it("REFUSE de démarrer si le flag est actif en production (fail-closed)", () => {
    process.env["NODE_ENV"] = "production";
    process.env["AUTH_DEV_IMPERSONATE"] = "true";

    expect(() => new AppConfig()).toThrow(/production/i);
  });
});
