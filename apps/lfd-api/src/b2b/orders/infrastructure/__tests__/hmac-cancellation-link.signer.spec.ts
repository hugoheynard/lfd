import { AppConfig } from "../../../../platform/config/app-config.js";
import { HmacCancellationLinkSigner } from "../hmac-cancellation-link.signer.js";

/**
 * Le jeton du lien d'annulation d'un invité (plan, C6.4, B1) : déterministe,
 * signé sous une clé DÉRIVÉE de celle du coffre — jamais la clé du coffre
 * elle-même —, vérifié par recalcul. Hors production, `AppConfig` prend la
 * clé publique de développement : c'est le vrai chemin, sans double.
 */
describe("HmacCancellationLinkSigner", () => {
  const config = new AppConfig();
  const signer = new HmacCancellationLinkSigner(config);

  it("la clé de signature est dérivée, distincte de la clé du coffre, sur 32 octets", () => {
    const key = config.cancellationLinkKey();
    expect(key).toHaveLength(32);
    expect(key.equals(config.fieldEncryptionKey())).toBe(false);
    expect(key.equals(config.cancellationLinkKey())).toBe(true);
  });

  it("un rejeu du courriel donne le même lien (B1)", () => {
    expect(signer.sign("ord_1")).toBe(signer.sign("ord_1"));
    expect(signer.sign("ord_1")).not.toBe(signer.sign("ord_2"));
  });

  it("le jeton se met dans un fragment d'URL sans échappement (base64url)", () => {
    expect(signer.sign("ord_1")).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  it("reconnaît son jeton, refuse celui d'une autre commande, un faux et un tronqué", () => {
    const token = signer.sign("ord_1");
    expect(signer.matches("ord_1", token)).toBe(true);
    expect(signer.matches("ord_2", token)).toBe(false);
    expect(signer.matches("ord_1", `${token.slice(0, -1)}A`)).toBe(token.endsWith("A"));
    expect(signer.matches("ord_1", token.slice(1))).toBe(false);
    expect(signer.matches("ord_1", "")).toBe(false);
  });
});
