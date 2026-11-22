import { createHmac } from "node:crypto";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { AesGcmFieldCipher } from "../../../../platform/crypto/aes-gcm-field-cipher.js";
import { HmacPayLinkTokenVault } from "../hmac-pay-link-token-vault.js";
import { RandomTokenGenerator } from "../random-token-generator.js";

describe("HmacPayLinkTokenVault", () => {
  const config = new AppConfig();
  const vault = new HmacPayLinkTokenVault(config, new AesGcmFieldCipher(Buffer.alloc(32, 7)));

  it("rend une empreinte déterministe, en hexadécimal, propre à chaque jeton", () => {
    expect(vault.fingerprint("a")).toBe(vault.fingerprint("a"));
    expect(vault.fingerprint("a")).toMatch(/^[0-9a-f]{64}$/u);
    expect(vault.fingerprint("a")).not.toBe(vault.fingerprint("b"));
  });

  it("signe sous sa propre clé, pas sous celle des liens d'annulation", () => {
    const underCancellationKey = createHmac("sha256", config.cancellationLinkKey())
      .update("a", "utf8")
      .digest("hex");
    expect(vault.fingerprint("a")).not.toBe(underCancellationKey);
  });

  it("scelle sans laisser le jeton en clair, et rouvre le scellé", () => {
    const sealed = vault.seal("jeton");
    expect(sealed).not.toContain("jeton");
    expect(vault.open(sealed)).toBe("jeton");
  });
});

describe("RandomTokenGenerator", () => {
  it("tire 32 octets en base64url : 43 caractères, jamais deux fois le même", () => {
    const tokens = new RandomTokenGenerator();
    const first = tokens.next();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(tokens.next()).not.toBe(first);
  });
});
