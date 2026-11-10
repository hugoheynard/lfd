import { InvalidOperationKeyError } from "../../errors/operation-errors.js";
import { OperationKey } from "../operation-key.js";

describe("OperationKey", () => {
  it("accepte une clé en minuscules, chiffres et tirets, rognée", () => {
    expect(OperationKey.of("  noel-2026 ").value).toBe("noel-2026");
    expect(OperationKey.of("galette").value).toBe("galette");
  });

  /** Elle part telle quelle dans `op:<key>` et dans une URL : rien à encoder. */
  it.each(["Noel-2026", "noël-2026", "noel_2026", "-noel", "noel-", "noel--2026", "", "a b"])(
    "refuse « %s »",
    (raw) => {
      expect(() => OperationKey.of(raw)).toThrow(InvalidOperationKeyError);
    },
  );

  it("refuse une clé de plus de 64 caractères", () => {
    expect(() => OperationKey.of("a".repeat(65))).toThrow(InvalidOperationKeyError);
    expect(OperationKey.of("a".repeat(64)).value).toHaveLength(64);
  });
});
