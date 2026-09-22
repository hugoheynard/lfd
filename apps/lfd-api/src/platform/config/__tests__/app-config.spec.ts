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
 * **L'URL de la base est refusée au démarrage si ce n'est pas un Postgres
 * direct** (geste 8 de la sortie d'Accelerate, 2026-09-22).
 *
 * Ces cas ont d'abord éprouvé un TRANSPORT — le schéma de l'URL choisissait
 * entre l'adaptateur `pg` et `accelerateUrl`, et `/health` publiait le choix.
 * La branche Accelerate a été retirée ; ce qui la remplace est un refus, et
 * c'est lui qu'on éprouve maintenant. La clé touchée est restaurée après
 * chaque cas.
 */
describe("AppConfig — l'URL de la base", () => {
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

  function urlOf(url: string): string {
    process.env["DATABASE_LFD_URL"] = url;
    return new AppConfig().databaseUrl();
  }

  it("accepte le pooler mutualisé de Prisma Postgres", () => {
    const url = "postgres://u:p@pooled.db.prisma.io:5432/postgres";
    expect(urlOf(url)).toBe(url);
  });

  it("accepte un Postgres local (`postgresql://`)", () => {
    const url = "postgresql://lfc:lfc@localhost:5433/lfc_b2b_test";
    expect(urlOf(url)).toBe(url);
  });

  /**
   * Régression : une URL Accelerate était **acceptée** et choisissait l'autre
   * branche. La branche partie, la laisser passer l'aurait donnée telle quelle
   * à l'adaptateur `pg`, qui aurait échoué à la PREMIÈRE REQUÊTE par un message
   * de pilote — loin de sa cause, et en production.
   */
  it("refuse une URL Accelerate, au démarrage et en le nommant", () => {
    expect(() => urlOf("prisma+postgres://accelerate.prisma-data.net/?api_key=x")).toThrow(
      /Accelerate/,
    );
  });

  it("refuse une URL qui n'est pas du Postgres", () => {
    expect(() => urlOf("mysql://u:p@localhost:3306/db")).toThrow(/DATABASE_LFD_URL/);
  });
});
