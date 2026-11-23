import {
  ChorusServiceCodeOnSolePayerError,
  ChorusServicePayerNotPublicError,
  InvalidChorusServiceError,
} from "../../errors/chorus-service-errors.js";
import { ChorusService, type ChorusServiceInput } from "../chorus-service.js";

/** L'instant du geste n'est comparé à aucune horloge. */
const AT = new Date(0);
const AGENT = { staffUserId: "staff_1", name: "Camille", role: "commercial" };
const PRINCIPAL = { companyId: "principal", isPublic: true };
const SHEET: ChorusServiceInput = {
  serviceCode: "UNITE-TIGNES",
  commitmentNumber: "1300012345",
  commitmentEndsOn: "2026-12-31",
};

function onUnit(input: ChorusServiceInput, payer = PRINCIPAL): ChorusService {
  return ChorusService.record("unite", payer, input, AT, AGENT);
}

describe("ChorusService", () => {
  it("garde le payeur, le code et l'engagement en cours d'une unité", () => {
    const service = onUnit(SHEET);

    expect(service.payerCompanyId).toBe("principal");
    expect(service.serviceCode).toBe("UNITE-TIGNES");
    expect(service.currentCommitment).toEqual({ number: "1300012345", endsOn: "2026-12-31" });
    expect(service.recordedBy).toEqual(AGENT);
  });

  it("retire les espaces de tête et de queue", () => {
    const service = onUnit({ ...SHEET, serviceCode: "  A  ", commitmentNumber: " N1 " });

    expect(service.serviceCode).toBe("A");
    expect(service.currentCommitment?.number).toBe("N1");
  });

  it("n'a aucun engagement en cours sans numéro ni date", () => {
    const service = onUnit({ ...SHEET, commitmentNumber: "", commitmentEndsOn: null });

    expect(service.currentCommitment).toBeNull();
  });

  it("refuse un numéro sans date de fin : un engagement a toujours une fin", () => {
    expect(() => onUnit({ ...SHEET, commitmentEndsOn: null })).toThrow(InvalidChorusServiceError);
  });

  it("refuse une date de fin sans numéro", () => {
    expect(() => onUnit({ ...SHEET, commitmentNumber: "   " })).toThrow(InvalidChorusServiceError);
  });

  it("refuse un jour qui n'existe pas", () => {
    expect(() => onUnit({ ...SHEET, commitmentEndsOn: "2026-02-30" })).toThrow(
      InvalidChorusServiceError,
    );
  });

  it("admet un numéro de 50 caractères, refuse le 51ᵉ", () => {
    expect(onUnit({ ...SHEET, commitmentNumber: "N".repeat(50) }).currentCommitment?.number).toBe(
      "N".repeat(50),
    );
    expect(() => onUnit({ ...SHEET, commitmentNumber: "N".repeat(51) })).toThrow(
      InvalidChorusServiceError,
    );
  });

  it("refuse un code service de plus de 100 caractères", () => {
    expect(() => onUnit({ ...SHEET, serviceCode: "S".repeat(101) })).toThrow(
      InvalidChorusServiceError,
    );
  });

  it("refuse un caractère non imprimable", () => {
    expect(() => onUnit({ ...SHEET, commitmentNumber: "N1\nN2" })).toThrow(
      InvalidChorusServiceError,
    );
  });

  it("refuse un payeur qui n'est pas public", () => {
    expect(() => onUnit(SHEET, { companyId: "principal", isPublic: false })).toThrow(
      ChorusServicePayerNotPublicError,
    );
  });

  it("refuse un code service sur une société qui est son propre payeur", () => {
    expect(() =>
      ChorusService.record("seul", { companyId: "seul", isPublic: true }, SHEET, AT, AGENT),
    ).toThrow(ChorusServiceCodeOnSolePayerError);
  });

  it("admet l'engagement seul sur une société qui est son propre payeur", () => {
    const service = ChorusService.record(
      "seul",
      { companyId: "seul", isPublic: true },
      { ...SHEET, serviceCode: "" },
      AT,
      AGENT,
    );

    expect(service.payerCompanyId).toBe("seul");
    expect(service.currentCommitment?.number).toBe("1300012345");
  });

  it("reconnaît la même fiche posée par un autre agent", () => {
    const other = ChorusService.record("unite", PRINCIPAL, SHEET, new Date(1), {
      staffUserId: "x",
      name: "",
      role: "",
    });

    expect(onUnit(SHEET).sameAs(other)).toBe(true);
    expect(onUnit(SHEET).sameAs(onUnit({ ...SHEET, commitmentEndsOn: "2027-01-31" }))).toBe(false);
    expect(
      onUnit(SHEET).sameAs(
        ChorusService.record("unite", { companyId: "autre", isPublic: true }, SHEET, AT, AGENT),
      ),
    ).toBe(false);
  });
});
