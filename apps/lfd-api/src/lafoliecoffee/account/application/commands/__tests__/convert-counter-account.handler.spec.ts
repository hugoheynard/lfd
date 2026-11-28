import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { Company } from "../../../domain/entities/company.js";
import {
  CompanyNotFoundError,
  CompanyStatusTransitionError,
} from "../../../domain/errors/account-errors.js";
import { CounterAccountConversionBlockedError } from "../../../domain/errors/counter-account-errors.js";
import { AdminCompanyReader } from "../../../domain/ports/admin-company.reader.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import type { CompanyStatus } from "../../../domain/value-objects/company-status.js";
import { ContactDetails } from "../../../domain/value-objects/contact-details.js";
import { counterFiche, FixedFiches } from "../../queries/__tests__/counter-account-fiche.js";
import { ActivateCompanyByStaffCommand } from "../activate-company.command.js";
import { ConvertCounterAccountCommand } from "../convert-counter-account.command.js";
import { ConvertCounterAccountHandler } from "../convert-counter-account.handler.js";
import { CallLog, InMemoryCompanies } from "./hierarchy-doubles.js";

const CONTACT = ContactDetails.create({
  firstName: "Camille",
  lastName: "Rousseau",
  fonction: "",
  email: "camille@kiosque.test",
  phone: "0612345678",
});

function stored(status: CompanyStatus, siret = "81245678900021"): Company {
  return Company.reconstitute({
    id: "k1",
    raisonSociale: siret === "" ? "" : "Kiosque du Quai SAS",
    enseigne: "Kiosque du Quai",
    formeJuridique: siret === "" ? "" : "SAS",
    siret,
    vatNumber: "",
    contact: CONTACT,
    grantedTerms: ["monthly"],
    requestedTerm: null,
    status,
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

async function world(fiche: ReturnType<typeof counterFiche> | null, company: Company | null) {
  const log = new CallLog();
  const companies = new InMemoryCompanies(log, new Map(company === null ? [] : [["k1", company]]));
  const sent: unknown[] = [];
  const module = await Test.createTestingModule({
    providers: [
      ConvertCounterAccountHandler,
      { provide: CompanyRepository, useValue: companies },
      {
        provide: AdminCompanyReader,
        useValue: new FixedFiches(new Map(fiche === null ? [] : [["k1", fiche]])),
      },
      { provide: UnitOfWork, useValue: new DirectUnitOfWork() },
      {
        provide: CommandBus,
        useValue: {
          execute: (command: unknown) => {
            sent.push(command);
            return Promise.resolve();
          },
        },
      },
    ],
  }).compile();
  return { handler: module.get(ConvertCounterAccountHandler), companies, sent };
}

const convert = new ConvertCounterAccountCommand("k1", "staff_lea");

describe("convertir un compte ouvert au comptoir (K5)", () => {
  it("rien ne manque : l'active par le cas d'usage de l'activation", async () => {
    const w = await world(counterFiche("k1"), stored("counter_opened"));

    expect(await w.handler.execute(convert)).toBe("active");
    expect(w.sent).toEqual([new ActivateCompanyByStaffCommand("k1", "staff_lea")]);
    expect(w.companies.saved).toEqual([]);
  });

  it("une pièce de l'activation manque, pas le SIRET ni l'adresse : passe en attente", async () => {
    const fiche = counterFiche("k1", { vatNumberRequired: true, vatNumber: "" });
    const w = await world(fiche, stored("counter_opened"));

    expect(await w.handler.execute(convert)).toBe("pending");
    expect(w.companies.saved.map((company) => company.status)).toEqual(["pending"]);
    expect(w.sent).toEqual([]);
  });

  it("sans adresse de facturation : refuse en le nommant, sans rien écrire", async () => {
    const fiche = counterFiche("k1", { addresses: { billing: null, deliveries: [] } });
    const w = await world(fiche, stored("counter_opened"));

    await expect(w.handler.execute(convert)).rejects.toBeInstanceOf(
      CounterAccountConversionBlockedError,
    );
    expect(w.companies.saved).toEqual([]);
  });

  it("sans SIRET : refuse, sans rien écrire", async () => {
    const fiche = counterFiche("k1", { siret: "", raisonSociale: "", formeJuridique: "" });
    const w = await world(fiche, stored("counter_opened", ""));

    await expect(w.handler.execute(convert)).rejects.toBeInstanceOf(
      CounterAccountConversionBlockedError,
    );
    expect(w.companies.saved).toEqual([]);
  });

  it("un compte déjà converti (second clic) : 409, ni activation ni écriture", async () => {
    const w = await world(counterFiche("k1", { status: "pending" }), stored("pending"));

    await expect(w.handler.execute(convert)).rejects.toBeInstanceOf(CompanyStatusTransitionError);
    expect(w.sent).toEqual([]);
    expect(w.companies.saved).toEqual([]);
  });

  it("une société inconnue : 404", async () => {
    const w = await world(null, null);

    await expect(w.handler.execute(convert)).rejects.toBeInstanceOf(CompanyNotFoundError);
  });
});
