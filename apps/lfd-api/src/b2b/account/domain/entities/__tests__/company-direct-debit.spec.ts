import type { DeferredTerm } from "@lfd/contracts";

import {
  DirectDebitAlreadyBlockedError,
  DirectDebitNotBlockedError,
  InvalidDirectDebitBlockReasonError,
  NoDirectDebitToBlockError,
} from "../../errors/direct-debit-errors.js";
import { ContactDetails } from "../../value-objects/contact-details.js";
import { DirectDebitBlock } from "../../value-objects/direct-debit-block.js";
import { Company } from "../company.js";

// Instant du blocage : jamais comparé à l'horloge, seulement relu tel quel.
const BLOCKED_AT = new Date("2026-09-25T09:00:00.000Z");
const STAFF = "staff_compta";

function company(
  grantedTerms: readonly DeferredTerm[],
  directDebitBlock: DirectDebitBlock | null = null,
): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Marais Café",
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "FR12345678901",
    contact: ContactDetails.create({
      firstName: "Camille",
      lastName: "Rousseau",
      fonction: "Gérante",
      email: "camille@pqmarais.fr",
      phone: "",
    }),
    grantedTerms,
    requestedTerm: null,
    status: "active",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    directDebitBlock,
  });
}

function blocked(): Company {
  return company(["monthly"], DirectDebitBlock.reconstitute(BLOCKED_AT, STAFF, "Impayé d'août"));
}

describe("Company — blocage du prélèvement", () => {
  it("bloquer suspend le règlement au compte SANS retirer le crédit", () => {
    const subject = company(["monthly"]);

    subject.blockDirectDebit("  Rejet bancaire  ", BLOCKED_AT, STAFF);

    expect(subject.settlesOnAccount()).toBe(false);
    expect(subject.grantedTerms).toEqual(["monthly"]);
    const block = subject.toPersistence().directDebitBlock;
    expect(block?.blockedAt).toBe(BLOCKED_AT);
    expect(block?.blockedBy).toBe(STAFF);
    expect(block?.reason).toBe("Rejet bancaire");
  });

  it("débloquer rend le crédit tel quel", () => {
    const subject = blocked();

    subject.unblockDirectDebit();

    expect(subject.settlesOnAccount()).toBe(true);
    expect(subject.grantedTerms).toEqual(["monthly"]);
    expect(subject.toPersistence().directDebitBlock).toBeNull();
  });

  it("refuse de bloquer deux fois — la raison du premier blocage ne s'écrase pas", () => {
    const subject = blocked();

    expect(() => subject.blockDirectDebit("Autre", BLOCKED_AT, "staff_autre")).toThrow(
      DirectDebitAlreadyBlockedError,
    );
    expect(subject.directDebitBlock?.reason).toBe("Impayé d'août");
  });

  it("refuse de bloquer un client sans crédit : il paie déjà par carte", () => {
    const subject = company([]);

    expect(() => subject.blockDirectDebit("Rejet", BLOCKED_AT, STAFF)).toThrow(
      NoDirectDebitToBlockError,
    );
    expect(subject.directDebitBlock).toBeNull();
  });

  it("refuse de débloquer ce qui n'est pas bloqué", () => {
    expect(() => company(["monthly"]).unblockDirectDebit()).toThrow(DirectDebitNotBlockedError);
  });

  it("refuse une raison vide", () => {
    const subject = company(["monthly"]);

    expect(() => subject.blockDirectDebit("   ", BLOCKED_AT, STAFF)).toThrow(
      InvalidDirectDebitBlockReasonError,
    );
    expect(subject.settlesOnAccount()).toBe(true);
  });

  it("retirer tout crédit lève le blocage — pas de blocage fantôme", () => {
    const subject = blocked();

    subject.grantTerms([]);

    expect(subject.directDebitBlock).toBeNull();
    // Ré-accorder ne ressuscite pas un blocage que personne n'a redécidé.
    subject.grantTerms(["monthly"]);
    expect(subject.settlesOnAccount()).toBe(true);
  });

  it("ré-accorder le même crédit à une société bloquée garde le blocage", () => {
    const subject = blocked();

    subject.grantTerms(["monthly"]);

    expect(subject.directDebitBlock?.reason).toBe("Impayé d'août");
    expect(subject.settlesOnAccount()).toBe(false);
  });

  it("une société déclarée n'est pas bloquée", () => {
    const declared = Company.declare(
      {
        raisonSociale: "",
        enseigne: "Chez Paul",
        formeJuridique: "",
        siret: "",
        siren: "",
        vatNumber: "",
      },
      null,
    );

    expect(declared.toPersistence().directDebitBlock).toBeNull();
  });
});
