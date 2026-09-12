import { AppConfig } from "../app-config.js";

/**
 * Ce test lit et écrit `process.env` — il fait partie de l'allowlist ESLint,
 * comme `app-config.spec.ts`, parce qu'il vérifie la passerelle qui en a le
 * monopole. Les clés touchées sont restaurées après chaque cas : l'env est
 * partagé entre les suites (`--runInBand`).
 */
const TOUCHED = ["FIELD_ENCRYPTION_KEY", "NODE_ENV"] as const;

/** 32 octets, la taille qu'AES-256 exige. */
const VALID_KEY = Buffer.alloc(32, 7).toString("base64");

describe("AppConfig — la clé du coffre de champs", () => {
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

  /**
   * 🔴 Le cas qui justifie tout le reste. Sans cette garde, un backend booterait
   * sans clé et écrirait des IBAN EN CLAIR dans une colonne que tout le monde
   * croit scellée — une erreur qui ne se découvrirait qu'en lisant la base.
   */
  it("refuse de démarrer en production sans clé", () => {
    process.env["NODE_ENV"] = "production";
    expect(() => new AppConfig()).toThrow(/FIELD_ENCRYPTION_KEY est obligatoire en production/u);
  });

  it("nomme la commande qui répare — le message est lu sous pression", () => {
    process.env["NODE_ENV"] = "production";
    expect(() => new AppConfig()).toThrow(/openssl rand -base64 32/u);
  });

  it("prend la clé configurée en production", () => {
    process.env["NODE_ENV"] = "production";
    process.env["FIELD_ENCRYPTION_KEY"] = VALID_KEY;
    expect(new AppConfig().fieldEncryptionKey().toString("base64")).toBe(VALID_KEY);
  });

  it("retombe hors production sur une clé de développement de 32 octets", () => {
    // Le repli change la SOURCE de la clé, jamais l'algorithme : un dépôt
    // fraîchement cloné démarre, et les e2e traversent le vrai chiffrement.
    process.env["NODE_ENV"] = "development";
    expect(new AppConfig().fieldEncryptionKey()).toHaveLength(32);
  });

  it("préfère la clé configurée au repli, même hors production", () => {
    process.env["NODE_ENV"] = "development";
    process.env["FIELD_ENCRYPTION_KEY"] = VALID_KEY;
    expect(new AppConfig().fieldEncryptionKey().toString("base64")).toBe(VALID_KEY);
  });

  it("refuse une clé mal dimensionnée au DÉMARRAGE, pas au premier IBAN", () => {
    process.env["NODE_ENV"] = "development";
    process.env["FIELD_ENCRYPTION_KEY"] = Buffer.alloc(16, 7).toString("base64");
    expect(() => new AppConfig()).toThrow(/32 octets attendus en base64, 16 reçus/u);
  });
});
