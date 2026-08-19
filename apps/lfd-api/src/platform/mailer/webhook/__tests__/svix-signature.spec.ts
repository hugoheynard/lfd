import { createHmac } from "node:crypto";

import {
  SIGNATURE_TOLERANCE_MS,
  verifySvixSignature,
  type SvixHeaders,
} from "../svix-signature.js";

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const NOW = 1_755_600_000_000;
const BODY = '{"type":"email.delivered","data":{"email_id":"re_1"}}';

/** Signe comme Svix le ferait — sinon le test ne prouve que sa propre logique. */
function signed(overrides: Partial<SvixHeaders> = {}, at = NOW): SvixHeaders {
  const timestamp = String(Math.floor(at / 1000));
  const id = "msg_2AbC";
  const key = Buffer.from(SECRET.replace("whsec_", ""), "base64");
  const mac = createHmac("sha256", key).update(`${id}.${timestamp}.${BODY}`).digest("base64");
  return { id, timestamp, signature: `v1,${mac}`, ...overrides };
}

const verify = (headers: SvixHeaders, nowMs = NOW): string =>
  verifySvixSignature({ secret: SECRET, headers, body: BODY, nowMs });

describe("verifySvixSignature", () => {
  it("accepte une signature valide", () => {
    expect(verify(signed())).toBe("ok");
  });

  it("🔴 refuse quand le secret n'est pas configuré", () => {
    // Accepter « parce qu'on n'a pas le secret » ouvrirait la route à
    // n'importe qui — c'est le seul endroit du système où l'on fait confiance
    // à un appel externe, et uniquement parce que la signature le prouve.
    expect(verifySvixSignature({ secret: null, headers: signed(), body: BODY, nowMs: NOW })).toBe(
      "unconfigured",
    );
  });

  it("refuse un corps modifié d'un seul octet", () => {
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: signed(),
        body: `${BODY} `,
        nowMs: NOW,
      }),
    ).toBe("invalid");
  });

  it("refuse un message rejoué hors de la fenêtre", () => {
    // Une signature reste valide pour toujours : sans borne temporelle, un
    // message capté se rejoue indéfiniment.
    expect(verify(signed({}, NOW - SIGNATURE_TOLERANCE_MS - 1000))).toBe("stale");
  });

  it("accepte un message à la limite de la fenêtre", () => {
    expect(verify(signed({}, NOW - SIGNATURE_TOLERANCE_MS + 1000))).toBe("ok");
  });

  it("🔴 accepte quand l'en-tête porte PLUSIEURS signatures", () => {
    // C'est ce qui permet de tourner un secret sans coupure : pendant la
    // bascule, les deux sont émises. En refuser une au motif qu'il y en a
    // plusieurs rendrait la rotation impossible sans perdre des événements.
    const valid = signed();
    const both = { ...valid, signature: `v1,YXV0cmVzaWduYXR1cmU= ${valid.signature ?? ""}` };

    expect(verify(both)).toBe("ok");
  });

  it("distingue « pas de signature » de « signature fausse »", () => {
    // Deux lectures différentes dans le journal : l'une dit qu'on n'est pas
    // appelé par qui on croit, l'autre qu'on n'est pas appelé du tout.
    expect(verify(signed({ signature: undefined }))).toBe("missing");
    expect(verify(signed({ signature: "v1,bidon" }))).toBe("invalid");
  });

  it("refuse un horodatage illisible plutôt que de le croire", () => {
    expect(verify(signed({ timestamp: "hier" }))).toBe("stale");
  });
});
