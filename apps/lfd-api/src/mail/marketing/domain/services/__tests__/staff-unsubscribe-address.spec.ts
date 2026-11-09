import { InvalidStaffUnsubscribeAddressError } from "../../errors/marketing-preference-admin.errors.js";
import { staffUnsubscribeAddressOf } from "../staff-unsubscribe-address.js";

describe("l'adresse que le staff désinscrit (C4)", () => {
  it("est rognée, et garde sa casse : la normalisation est celle du registre", () => {
    expect(staffUnsubscribeAddressOf("  Colette@Halles.fr ")).toBe("Colette@Halles.fr");
  });

  it.each(["", "   ", "colette", `${"a".repeat(316)}@b.fr`])("refuse « %s »", (address) => {
    expect(() => staffUnsubscribeAddressOf(address)).toThrow(InvalidStaffUnsubscribeAddressError);
  });

  it("admet une adresse de 320 caractères tout juste", () => {
    const address = `${"a".repeat(315)}@b.fr`;
    expect(staffUnsubscribeAddressOf(address)).toBe(address);
  });
});
