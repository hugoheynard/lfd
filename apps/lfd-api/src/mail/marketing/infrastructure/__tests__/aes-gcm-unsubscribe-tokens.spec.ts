import { AppConfig } from "../../../../platform/config/app-config.js";
import { AesGcmUnsubscribeTokens } from "../aes-gcm-unsubscribe-tokens.js";
import { HmacAddressPrint } from "../hmac-address-print.js";

/**
 * Le jeton et l'empreinte, sur le vrai `AppConfig` : hors production, il
 * prend la clé publique de développement — le vrai chemin, sans double.
 */
describe("AesGcmUnsubscribeTokens (règle 4)", () => {
  const config = new AppConfig();
  const tokens = new AesGcmUnsubscribeTokens(config);
  const target = { space: "lfc", recipientKey: "colette@halles.fr" } as const;

  it("les deux clés sont dérivées, distinctes entre elles et de la clé du coffre", () => {
    const tokenKey = config.mailUnsubscribeTokenKey();
    const printKey = config.mailMarketingPrintKey();
    expect(tokenKey).toHaveLength(32);
    expect(tokenKey.equals(config.fieldEncryptionKey())).toBe(false);
    expect(printKey.equals(config.fieldEncryptionKey())).toBe(false);
    expect(tokenKey.equals(printKey)).toBe(false);
    expect(tokenKey.equals(config.cancellationLinkKey())).toBe(false);
  });

  it("s'ouvre sur ce qu'il chiffre, et ne laisse pas lire l'adresse", () => {
    const token = tokens.seal(target);
    expect(tokens.open(token)).toEqual(target);
    expect(token).not.toContain("colette");
    expect(token).not.toContain("halles");
    expect(token).toMatch(/^[A-Za-z0-9._-]+$/u);
  });

  it("refuse un jeton altéré, tronqué ou inventé — sans lever", () => {
    const token = tokens.seal(target);
    const parts = token.split(".");
    const tag = parts[3] ?? "";
    const altered = [
      ...parts.slice(0, 3),
      `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`,
      ...parts.slice(4),
    ];
    expect(tokens.open(altered.join("."))).toBeNull();
    expect(tokens.open(token.slice(3))).toBeNull();
    expect(tokens.open("v1.x.y.z.w")).toBeNull();
    expect(tokens.open("")).toBeNull();
  });
});

describe("HmacAddressPrint", () => {
  const prints = new HmacAddressPrint(new AppConfig());

  it("déterministe, 64 hexadécimaux, sans l'adresse", () => {
    const print = prints.of("colette@halles.fr");
    expect(print).toMatch(/^[0-9a-f]{64}$/u);
    expect(prints.of("colette@halles.fr")).toBe(print);
    expect(prints.of("colette@halles.com")).not.toBe(print);
  });
});
