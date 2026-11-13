import { InvalidLegalEntityError } from "../../errors/accounting-errors.js";
import { LegalAddress } from "../../value-objects/legal-address.js";
import { Siren } from "../../value-objects/siren.js";
import {
  LegalEntity,
  TRANSFER_DUE_DAYS_DEFAULT,
  TRANSFER_DUE_DAYS_MAX,
  TRANSFER_DUE_DAYS_MIN,
} from "../legal-entity.js";

/**
 * L'échéance des factures au virement (V6, `le-paiement-par-virement.md`) :
 * N jours après l'émission, 15 par défaut, de 1 à 45.
 */

function declared(): LegalEntity {
  return LegalEntity.declare({
    id: "le1",
    name: "La Folie Douce",
    legalForm: "SAS",
    siren: Siren.create("552100554"),
    address: LegalAddress.create({
      line1: "12 rue du Fournil",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    }),
    rcs: "Chambéry B 552 100 554",
    shareCapitalCents: 1_000_000,
    vatNumber: "FR89552100554",
  });
}

describe("LegalEntity — l'échéance des factures au virement", () => {
  it("naît à 15 jours après l'émission", () => {
    const entity = declared();
    expect(TRANSFER_DUE_DAYS_DEFAULT).toBe(15);
    expect(entity.transferDueDaysAfterIssue).toBe(15);
    expect(entity.toPersistence().transferDueDaysAfterIssue).toBe(15);
  });

  it("accepte les deux bornes, 1 et 45 jours", () => {
    const entity = declared();
    expect(entity.setTransferDueDays(TRANSFER_DUE_DAYS_MIN)).toBe(true);
    expect(entity.transferDueDaysAfterIssue).toBe(1);
    expect(entity.setTransferDueDays(TRANSFER_DUE_DAYS_MAX)).toBe(true);
    expect(entity.toPersistence().transferDueDaysAfterIssue).toBe(45);
  });

  it("refuse 0, 46, un négatif et un fractionnaire, en nommant le réglage et les bornes", () => {
    const entity = declared();
    expect(() => entity.setTransferDueDays(0)).toThrow(InvalidLegalEntityError);
    expect(() => entity.setTransferDueDays(46)).toThrow(/au plus 45 jours/u);
    expect(() => entity.setTransferDueDays(-5)).toThrow(InvalidLegalEntityError);
    expect(() => entity.setTransferDueDays(10.5)).toThrow(/entier/u);
    expect(() => entity.setTransferDueDays(46)).toThrow(/virement/u);
    expect(entity.transferDueDaysAfterIssue).toBe(15);
  });

  it("une saisie rejouée n'est pas un changement", () => {
    const entity = declared();
    expect(entity.setTransferDueDays(15)).toBe(false);
    expect(entity.setTransferDueDays(30)).toBe(true);
    expect(entity.setTransferDueDays(30)).toBe(false);
  });

  it("se relit depuis la base, et l'instantané du créancier le porte", () => {
    const entity = LegalEntity.reconstitute({
      ...declared().toPersistence(),
      transferDueDaysAfterIssue: 30,
    });
    expect(entity.transferDueDaysAfterIssue).toBe(30);
  });
});
