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

/**
 * L'arrêt d'urgence de l'instantané du catalogue (`le-catalogue-en-memoire.md`,
 * M1b). Ce test écrit `process.env`, comme `app-config.spec.ts` : la clé
 * touchée est restaurée après chaque cas.
 */
const KEY = "CATALOGUE_SNAPSHOT_MEMORY";

describe("AppConfig — CATALOGUE_SNAPSHOT_MEMORY", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[KEY];
    delete process.env[KEY];
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[KEY];
    } else {
      process.env[KEY] = saved;
    }
  });

  it("absente : l'instantané est gardé (on)", () => {
    expect(new AppConfig().catalogueSnapshotMemory()).toBe(true);
  });

  it("« on » : gardé", () => {
    process.env[KEY] = "on";
    expect(new AppConfig().catalogueSnapshotMemory()).toBe(true);
  });

  it("« off » : chaque requête relit la base", () => {
    process.env[KEY] = " OFF ";
    expect(new AppConfig().catalogueSnapshotMemory()).toBe(false);
  });

  it("une autre valeur refuse de démarrer, en nommant les deux admises", () => {
    process.env[KEY] = "false";
    expect(() => new AppConfig()).toThrow(/« on » et « off »/);
  });
});

/**
 * Le cran de sûreté des purges (Hugo, 2026-11-06 : « je ne veux pas perdre de
 * la data sans le savoir »). Mêmes précautions sur `process.env`.
 */
describe("AppConfig — OUTBOX_PURGE et MAIL_REQUEST_PURGE", () => {
  const keys = ["OUTBOX_PURGE", "MAIL_REQUEST_PURGE"] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
  });

  afterEach(() => {
    for (const key of keys) {
      const value = saved[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("absentes : à blanc (dry-run), rien n'est supprimé", () => {
    const config = new AppConfig();
    expect(config.outboxPurgeMode()).toBe("dry-run");
    expect(config.mailRequestPurgeMode()).toBe("dry-run");
  });

  it("« on » et « off » sont lus, chacune pour soi", () => {
    process.env["OUTBOX_PURGE"] = " ON ";
    process.env["MAIL_REQUEST_PURGE"] = "off";
    const config = new AppConfig();
    expect(config.outboxPurgeMode()).toBe("on");
    expect(config.mailRequestPurgeMode()).toBe("off");
  });

  it("une autre valeur refuse de démarrer, en nommant la variable", () => {
    process.env["MAIL_REQUEST_PURGE"] = "true";
    expect(() => new AppConfig()).toThrow(/MAIL_REQUEST_PURGE vaut « true »/);
  });
});
