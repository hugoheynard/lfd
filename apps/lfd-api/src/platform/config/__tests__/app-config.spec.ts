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

/**
 * Le transport se lit au schéma de l'URL — et `/health` le publie, ce qui en
 * fait la preuve de la sortie d'Accelerate au déploiement.
 * La clé touchée est restaurée après chaque cas.
 */
describe("AppConfig — transport vers la base", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env["DATABASE_LFD_URL"];
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env["DATABASE_LFD_URL"];
    } else {
      process.env["DATABASE_LFD_URL"] = saved;
    }
  });

  function transportOf(url: string): string {
    process.env["DATABASE_LFD_URL"] = url;
    return new AppConfig().databaseTransport();
  }

  it("le pooler mutualisé de Prisma Postgres passe par `pg`", () => {
    expect(transportOf("postgres://u:p@pooled.db.prisma.io:5432/postgres")).toBe("pg");
  });

  it("un Postgres local (`postgresql://`) passe par `pg`", () => {
    expect(transportOf("postgresql://lfc:lfc@localhost:5433/lfc_b2b_test")).toBe("pg");
  });

  it("l'URL Accelerate reste `accelerate`, pour le retour arrière", () => {
    expect(transportOf("prisma+postgres://accelerate.prisma-data.net/?api_key=x")).toBe(
      "accelerate",
    );
  });
});
