import type { Company } from "../../../domain/entities/company.js";
import {
  InvalidEmailError,
  SiretAlreadyRegisteredError,
} from "../../../domain/errors/account-errors.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import type { ContactDetailsInput } from "../../../domain/value-objects/contact-details.js";
import { CreateCompanyByStaffCommand } from "../create-company-by-staff.command.js";
import { CreateCompanyByStaffHandler } from "../create-company-by-staff.handler.js";

interface Doubles {
  readonly handler: CreateCompanyByStaffHandler;
  /** Les sociétés passées à `declareUnowned` (donc créées sans propriétaire). */
  readonly unowned: Company[];
  /** Vrai si une écriture **avec** propriétaire a eu lieu (ne doit jamais arriver). */
  readonly owned: { count: number };
}

function doubles(options: { siretTaken?: boolean } = {}): Doubles {
  const unowned: Company[] = [];
  const owned = { count: 0 };

  const companies: CompanyRepository = {
    existsBySiret: () => Promise.resolve(options.siretTaken === true),
    declareOwnedBy: () => {
      owned.count += 1;
      return Promise.resolve("company_owned");
    },
    declareUnowned: (company) => {
      unowned.push(company);
      return Promise.resolve("company_unowned");
    },
    updatePrimaryContact: () => Promise.resolve(),
    updateIdentity: () => Promise.resolve(),
    requestPaymentTerm: () => Promise.resolve(),
    saveKbisMetadata: () => Promise.resolve(),
    kbisLocation: () => Promise.resolve(null),
  };

  return { handler: new CreateCompanyByStaffHandler(companies), unowned, owned };
}

function command(contact: Partial<ContactDetailsInput> = {}): CreateCompanyByStaffCommand {
  return new CreateCompanyByStaffCommand(
    "Café des Halles SAS",
    "",
    "SAS",
    "812 456 789 00021",
    "",
    {
      firstName: "Camille",
      lastName: "Rousseau",
      fonction: "Gérante",
      email: "camille@halles.fr",
      phone: "",
      ...contact,
    },
  );
}

describe("CreateCompanyByStaffHandler", () => {
  it("crée la société SANS propriétaire et retourne son seul identifiant", async () => {
    const { handler, unowned, owned } = doubles();

    await expect(handler.execute(command())).resolves.toBe("company_unowned");
    expect(unowned).toHaveLength(1);
    // Jamais de rattachement : pas de membership à la création admin.
    expect(owned.count).toBe(0);
  });

  it("porte le contact saisi par le staff, fonction incluse", async () => {
    const { handler, unowned } = doubles();

    await handler.execute(command());

    expect(unowned[0]?.contact.email.value).toBe("camille@halles.fr");
    expect(unowned[0]?.contact.fonction).toBe("Gérante");
  });

  it("refuse un SIRET déjà enregistré, sans rien créer", async () => {
    const { handler, unowned } = doubles({ siretTaken: true });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(SiretAlreadyRegisteredError);
    expect(unowned).toEqual([]);
  });

  it("refuse un contact invalide (e-mail vide) avant tout écriture", async () => {
    const { handler, unowned } = doubles();

    await expect(handler.execute(command({ email: "" }))).rejects.toBeInstanceOf(InvalidEmailError);
    expect(unowned).toEqual([]);
  });
});
