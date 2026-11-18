import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { chaletCompany } from "../../../domain/entities/__tests__/company-hierarchy-fixtures.js";
import { BillingNatureChangeAcrossFollowError } from "../../../domain/errors/hierarchy-errors.js";
import type { BillingNatureNeighbours } from "../../../domain/ports/billing-nature-neighbours.reader.js";
import { UpdateIdentityByStaffCommand } from "../update-identity-by-staff.command.js";
import { UpdateIdentityByStaffHandler } from "../update-identity-by-staff.handler.js";
import { CallLog, FixedNatureNeighbours, InMemoryCompanies } from "./hierarchy-doubles.js";

/** L'instant des voisins : relu tel quel, jamais comparé. */
const clock = new FixedClock(new Date(0));
const FOLLOWS_PUBLIC: BillingNatureNeighbours = { principalForm: "public_state", siteForms: [] };

function correct(formeJuridique: string, neighbours: BillingNatureNeighbours) {
  const companies = new InMemoryCompanies(new CallLog(), new Map([["chalet", chaletCompany()]]));
  const handler = new UpdateIdentityByStaffHandler(
    companies,
    new RecordingPublisher(),
    new DirectUnitOfWork(),
    new FixedNatureNeighbours(neighbours),
    clock,
  );
  const run = () =>
    handler.execute(
      new UpdateIdentityByStaffCommand("chalet", {
        enseigne: "",
        vatNumber: "",
        raisonSociale: "Chalet Edelweiss SARL",
        formeJuridique,
        siret: "",
        siren: "",
      }),
    );
  return { run, companies };
}

describe("Corriger l'identité d'un compte lié en facturation (P1b)", () => {
  it("refuse qu'un site qui suit un principal public prenne une forme d'entreprise", async () => {
    const { run, companies } = correct("sas", FOLLOWS_PUBLIC);

    await expect(run()).rejects.toThrow(BillingNatureChangeAcrossFollowError);
    expect(companies.saved).toEqual([]);
    await expect(correct("sas", FOLLOWS_PUBLIC).run()).rejects.toThrow(
      /compte principal doivent garder la même nature/u,
    );
  });

  it("laisse ce site prendre une forme publique", async () => {
    const { run, companies } = correct("public_establishment", FOLLOWS_PUBLIC);

    await run();

    expect(companies.saved[0]?.formeJuridique).toBe("public_establishment");
  });

  it("refuse une forme d'une autre nature que celle des sites qui le suivent", async () => {
    const { run } = correct("public_state", { principalForm: null, siteForms: ["", "sarl"] });

    await expect(run()).rejects.toThrow(/ses sites doivent garder la même nature/u);
  });

  it("laisse libre un compte qui ne suit personne et que personne ne suit", async () => {
    const { run, companies } = correct("sas", { principalForm: null, siteForms: [] });

    await run();

    expect(companies.saved).toHaveLength(1);
  });
});
