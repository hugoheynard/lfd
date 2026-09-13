import { randomBytes } from "node:crypto";

import { AesGcmFieldCipher } from "../aes-gcm-field-cipher.js";
import { FieldEncryptionKeyError, SealedValueUnreadableError } from "../crypto-errors.js";

/** Un IBAN : exactement ce que ce coffre existe pour tenir. */
const SECRET = "FR1420041010050500013M02606";

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);

function cipher(key: Buffer = KEY): AesGcmFieldCipher {
  return new AesGcmFieldCipher(key);
}

describe("AesGcmFieldCipher", () => {
  it("rend la valeur d'origine après un aller-retour", () => {
    const box = cipher();
    expect(box.open(box.seal(SECRET))).toBe(SECRET);
  });

  it("tient les accents et les caractères hors ASCII", () => {
    const box = cipher();
    const holder = "Refuge du Col — Val d'Isère";
    expect(box.open(box.seal(holder))).toBe(holder);
  });

  it("tient la chaîne vide sans la confondre avec une absence", () => {
    const box = cipher();
    expect(box.open(box.seal(""))).toBe("");
  });

  it("ne laisse pas la valeur en clair dans le scellé", () => {
    expect(cipher().seal(SECRET)).not.toContain("20041010");
  });

  /**
   * 🔴 La propriété la plus importante du fichier. Un scellé déterministe
   * laisserait comparer deux lignes pour savoir si elles portent le MÊME
   * compte, sans clé — et deux messages sous le même couple (clé, IV) livrent
   * leur XOR en GCM.
   */
  it("tire un IV neuf à chaque scellement : deux scellés diffèrent", () => {
    const box = cipher();
    const [first, second] = [box.seal(SECRET), box.seal(SECRET)];
    expect(first).not.toBe(second);
    expect(box.open(first)).toBe(box.open(second));
  });

  it("nomme la rotation de clé plutôt qu'une corruption", () => {
    const sealed = cipher().seal(SECRET);
    expect(() => cipher(OTHER_KEY).open(sealed)).toThrow(/autre clé/u);
  });

  it("refuse un scellé altéré au lieu de rendre des octets plausibles", () => {
    // C'est ce que GCM apporte sur CBC : l'intégrité, pas seulement le secret.
    const box = cipher();
    const parts = box.seal(SECRET).split(".");
    const payload = parts[4] ?? "";
    parts[4] = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;
    expect(() => box.open(parts.join("."))).toThrow(SealedValueUnreadableError);
  });

  it("refuse un scellé tronqué", () => {
    expect(() => cipher().open("v1.deadbeef.abc")).toThrow(/format inattendu/u);
  });

  it("refuse un format qu'elle ne connaît pas", () => {
    const parts = cipher().seal(SECRET).split(".");
    parts[0] = "v2";
    expect(() => cipher().open(parts.join("."))).toThrow(/inconnu de cette version/u);
  });

  it("ne recopie jamais la valeur ni le scellé dans le refus", () => {
    const box = cipher();
    const sealed = box.seal(SECRET);
    let caught: unknown;
    try {
      cipher(OTHER_KEY).open(sealed);
    } catch (error) {
      caught = error;
    }
    const message = (caught as SealedValueUnreadableError).message;
    expect(message).not.toContain(sealed);
    expect(message).not.toContain(SECRET);
  });

  it("refuse une clé qui n'est pas celle d'AES-256", () => {
    expect(() => cipher(randomBytes(16))).toThrow(FieldEncryptionKeyError);
    expect(() => cipher(randomBytes(64))).toThrow(FieldEncryptionKeyError);
  });

  it("ne révèle pas la clé par son empreinte", () => {
    const sealed = cipher().seal(SECRET);
    expect(sealed).not.toContain(KEY.toString("base64url"));
    expect(sealed).not.toContain(KEY.toString("hex"));
  });
});

describe("AesGcmFieldCipher — les octets d'une pièce jointe", () => {
  const cipher = new AesGcmFieldCipher(Buffer.alloc(32, 3));

  it("rend les mêmes octets après un aller-retour", () => {
    const pdf = Buffer.from("%PDF-1.7\n... un mandat signé ...", "utf8");

    expect(cipher.openBytes(cipher.sealBytes(pdf))).toEqual(pdf);
  });

  it("ne laisse RIEN du clair dans le scellé", () => {
    const pdf = Buffer.from("IBAN FR7630006000011234567890189 signature", "utf8");

    const sealed = cipher.sealBytes(pdf);

    expect(sealed.toString("latin1")).not.toContain("FR7630006000011234567890189");
  });

  /**
   * Le même IV deux fois en GCM ne dégrade pas la sécurité, il la détruit : deux
   * messages sous le même couple (clé, IV) livrent leur XOR.
   */
  it("tire un IV neuf à chaque scellement", () => {
    const pdf = Buffer.from("identique", "utf8");

    expect(cipher.sealBytes(pdf).equals(cipher.sealBytes(pdf))).toBe(false);
  });

  it("refuse un octet modifié — GCM authentifie", () => {
    const sealed = cipher.sealBytes(Buffer.from("un mandat", "utf8"));
    // `writeUInt8` plutôt qu'un `^=` sur l'index : l'accès indexé d'un Buffer
    // est typé `number | undefined`, et le cast qu'il faudrait sinon est
    // précisément ce que `lint:no-type-escapes` refuse dans un test.
    sealed.writeUInt8(sealed.readUInt8(sealed.length - 1) ^ 0xff, sealed.length - 1);

    expect(() => cipher.openBytes(sealed)).toThrow(SealedValueUnreadableError);
  });

  /**
   * 🔴 Le message compte autant que le refus : une pièce déposée AVANT la
   * bascule n'a pas d'en-tête, et ce n'est pas une corruption. Dire « altéré »
   * enverrait chercher un disque abîmé là où il n'y a qu'un fichier ancien.
   */
  it("distingue une pièce d'avant le scellement d'une pièce abîmée", () => {
    const clair = Buffer.from("%PDF-1.7 déposé avant la bascule", "utf8");

    expect(() => cipher.openBytes(clair)).toThrow(/déposée avant le scellement/u);
  });

  it("refuse ce qui a été scellé sous une autre clé", () => {
    const autre = new AesGcmFieldCipher(Buffer.alloc(32, 9));

    expect(() => cipher.openBytes(autre.sealBytes(Buffer.from("x", "utf8")))).toThrow(/autre clé/u);
  });

  it("ne paie pas la taxe base64 — le scellé ne gonfle que de son en-tête", () => {
    // 4 (magie) + 8 (empreinte) + 12 (IV) + 16 (tag) = 40 octets, quelle que
    // soit la taille de la pièce. Un base64 aurait coûté 33 % du fichier.
    const pdf = Buffer.alloc(100_000, 1);

    expect(cipher.sealBytes(pdf).length).toBe(pdf.length + 40);
  });
});
