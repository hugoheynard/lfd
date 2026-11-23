import {
  ExportReaderKeyAlreadyRevokedError,
  ExportReaderKeyExpiryInPastError,
  ExportReaderKeyIpInvalidError,
  ExportReaderKeyLabelInvalidError,
  ExportReaderKeySecretTooWeakError,
  ExportReaderKeyStateInvalidError,
} from "../../errors/export-reader-key-errors.js";
import { hashExportKeySecret } from "../../value-objects/export-key-secret.js";
import { ExportReaderKey, type IssueExportReaderKey } from "../export-reader-key.js";

/** Les dates ne se comparent qu'entre elles : la clé ne lit aucune horloge. */
const AT = new Date("2026-11-23T09:00:00.000Z");
const EXPIRES = new Date("2027-11-23T09:00:00.000Z");
const SECRET = "s".repeat(43);

function issue(overrides: Partial<IssueExportReaderKey> = {}): ExportReaderKey {
  return ExportReaderKey.issue({
    id: "key_1",
    label: "Direction",
    secret: SECRET,
    at: AT,
    byStaffId: "staff_1",
    expiresAt: EXPIRES,
    allowedIps: [],
    ...overrides,
  });
}

describe("ExportReaderKey — naître", () => {
  it("ne garde que le haché du secret", () => {
    const state = issue().toPersistence();

    expect(state.secretHash).toBe(hashExportKeySecret(SECRET));
    expect(state.secretHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(state)).not.toContain(SECRET);
    expect(state).toMatchObject({ revokedAt: null, revokedByStaffId: null, label: "Direction" });
  });

  it("refuse un lecteur vide ou trop long", () => {
    expect(() => issue({ label: "   " })).toThrow(ExportReaderKeyLabelInvalidError);
    expect(() => issue({ label: "x".repeat(121) })).toThrow(ExportReaderKeyLabelInvalidError);
  });

  it("refuse une échéance qui n'est pas à venir", () => {
    expect(() => issue({ expiresAt: AT })).toThrow(ExportReaderKeyExpiryInPastError);
  });

  it("refuse un secret plus court que 32 octets encodés", () => {
    expect(() => issue({ secret: "court" })).toThrow(ExportReaderKeySecretTooWeakError);
  });

  it("refuse une adresse illisible, normalise et dédoublonne les autres", () => {
    expect(() => issue({ allowedIps: ["203.0.113.300"] })).toThrow(ExportReaderKeyIpInvalidError);
    expect(issue({ allowedIps: [" 2001:DB8::1 ", "2001:db8::1"] }).allowedIps).toEqual([
      "2001:db8::1",
    ]);
  });
});

describe("ExportReaderKey — admettre un appel", () => {
  const before = new Date(EXPIRES.getTime() - 1);

  it("liste vide : toute adresse", () => {
    expect(issue().admits(before, "198.51.100.4")).toBe(true);
  });

  it("refuse une adresse hors de la liste, admet celle de la liste", () => {
    const key = issue({ allowedIps: ["203.0.113.7"] });

    expect(key.admits(before, "203.0.113.7")).toBe(true);
    expect(key.admits(before, "203.0.113.8")).toBe(false);
  });

  it("refuse une clé échue, dès son échéance", () => {
    expect(issue().admits(EXPIRES, "198.51.100.4")).toBe(false);
  });

  it("refuse une clé révoquée", () => {
    const key = issue();
    key.revoke(AT, "staff_2");

    expect(key.admits(before, "198.51.100.4")).toBe(false);
  });
});

describe("ExportReaderKey — révoquer", () => {
  it("pose l'instant et l'auteur ensemble", () => {
    const key = issue();
    key.revoke(AT, "staff_2");

    expect(key.toPersistence()).toMatchObject({ revokedAt: AT, revokedByStaffId: "staff_2" });
  });

  it("refuse une seconde révocation", () => {
    const key = issue();
    key.revoke(AT, "staff_2");

    expect(() => key.revoke(AT, "staff_3")).toThrow(ExportReaderKeyAlreadyRevokedError);
  });

  it("relue révoquée, elle refuse aussi d'être révoquée à nouveau", () => {
    const key = issue();
    key.revoke(AT, "staff_2");
    const reread = ExportReaderKey.rehydrate(key.toPersistence());

    expect(reread.revoked).toBe(true);
    expect(() => reread.revoke(AT, "staff_3")).toThrow(ExportReaderKeyAlreadyRevokedError);
  });

  it("refuse de relire une révocation à moitié posée ou un haché illisible", () => {
    const state = issue().toPersistence();

    expect(() => ExportReaderKey.rehydrate({ ...state, revokedAt: AT })).toThrow(
      ExportReaderKeyStateInvalidError,
    );
    expect(() => ExportReaderKey.rehydrate({ ...state, secretHash: SECRET })).toThrow(
      ExportReaderKeyStateInvalidError,
    );
  });
});
