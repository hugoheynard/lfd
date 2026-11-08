import { AppConfig } from "../../../../platform/config/app-config.js";
import { AesGcmConsentConfirmTokens } from "../aes-gcm-consent-confirm-tokens.js";
import { AesGcmUnsubscribeTokens } from "../aes-gcm-unsubscribe-tokens.js";

/**
 * Le jeton de confirmation d'un accord (plan de désinscription, règle 18),
 * sur le vrai `AppConfig` : hors production, la clé publique de
 * développement — le vrai chemin, sans double.
 */
describe("AesGcmConsentConfirmTokens (règle 18)", () => {
  const config = new AppConfig();
  const tokens = new AesGcmConsentConfirmTokens(config);
  const target = {
    space: "lfc",
    recipientKey: "colette@halles.fr",
    issuedAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0, 123)),
  } as const;

  it("sa clé est dérivée, distincte de celles du registre et du coffre", () => {
    const key = config.mailMarketingConfirmTokenKey();
    expect(key).toHaveLength(32);
    expect(key.equals(config.fieldEncryptionKey())).toBe(false);
    expect(key.equals(config.mailUnsubscribeTokenKey())).toBe(false);
    expect(key.equals(config.mailMarketingPrintKey())).toBe(false);
  });

  it("s'ouvre sur ce qu'il chiffre, à la milliseconde, sans laisser lire l'adresse", () => {
    const token = tokens.seal(target);
    expect(tokens.open(token)).toEqual(target);
    expect(token).not.toContain("colette");
    expect(token).toMatch(/^[A-Za-z0-9._-]+$/u);
  });

  it("un jeton de DÉSINSCRIPTION ne s'ouvre pas comme une confirmation", () => {
    const unsubscribe = new AesGcmUnsubscribeTokens(config).seal(target);
    expect(tokens.open(unsubscribe)).toBeNull();
  });

  it("refuse un jeton altéré, tronqué ou inventé — sans lever", () => {
    const token = tokens.seal(target);
    const parts = token.split(".");
    const tag = parts[3] ?? "";
    parts[3] = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;
    expect(tokens.open(parts.join("."))).toBeNull();
    expect(tokens.open(token.slice(3))).toBeNull();
    expect(tokens.open("")).toBeNull();
  });
});
