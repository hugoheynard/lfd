import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { CompanyChangedSinceReadError } from "../../../domain/errors/account-errors.js";
import { TablePickupPointNames } from "../../../domain/ports/__tests__/table-pickup-point-names.js";
import { GrantTermsCommand } from "../grant-terms.command.js";
import { GrantTermsHandler } from "../grant-terms.handler.js";
import { PreferFulfillmentByStaffCommand } from "../prefer-fulfillment-by-staff.command.js";
import { PreferFulfillmentByStaffHandler } from "../prefer-fulfillment-by-staff.handler.js";
import { UpdateIdentityByStaffCommand } from "../update-identity-by-staff.command.js";
import { UpdateIdentityByStaffHandler } from "../update-identity-by-staff.handler.js";
import { UpdatePrimaryContactByStaffCommand } from "../update-primary-contact-by-staff.command.js";
import { UpdatePrimaryContactByStaffHandler } from "../update-primary-contact-by-staff.handler.js";
import { AddressReaderWithA1, InMemoryCompanies } from "./member-acts-doubles.js";
import { silentGestures } from "./site-gesture-doubles.js";

/**
 * Les quatre gestes de la fiche staff refusent une fiche lue à une autre
 * révision que celle chargée (`InMemoryCompanies` charge la révision 0) — sauf
 * quand le geste ne change rien : un rejeu reste un rejeu, pas un conflit.
 */

/** Une révision que la fiche chargée n'a pas : l'écran a lu une fiche dépassée. */
const STALE = 3;
const CURRENT = 0;

const HOLDER = {
  firstName: "Karim",
  lastName: "Rousseau",
  fonction: "Gérant",
  email: "karim@pqmarais.fr",
  phone: "06 11 22 33 44",
};
const IDENTITY = {
  enseigne: "Marais Café",
  vatNumber: "",
  raisonSociale: "PQ Marais SAS",
  formeJuridique: "SAS",
  siret: "",
  siren: "",
};
const PREFERENCE = {
  method: "delivery" as const,
  pickupAddressId: null,
  deliveryAddressId: "a1",
  signatureRequired: true,
};

function build() {
  const companies = new InMemoryCompanies();
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  const gestures: Record<string, (revision: number | null) => Promise<void>> = {
    identity: (revision) =>
      new UpdateIdentityByStaffHandler(companies, events, uow).execute(
        new UpdateIdentityByStaffCommand("c1", IDENTITY, revision),
      ),
    contact: (revision) =>
      new UpdatePrimaryContactByStaffHandler(companies, events, uow, silentGestures()).execute(
        new UpdatePrimaryContactByStaffCommand("c1", HOLDER, revision),
      ),
    terms: (revision) =>
      new GrantTermsHandler(companies, events, uow).execute(
        new GrantTermsCommand("c1", ["monthly"], revision),
      ),
    preference: (revision) =>
      new PreferFulfillmentByStaffHandler(
        companies,
        new AddressReaderWithA1(),
        new TablePickupPointNames(),
        events,
        uow,
      ).execute(new PreferFulfillmentByStaffCommand("c1", PREFERENCE, revision)),
  };
  return { companies, events, gestures };
}

describe.each(["identity", "contact", "terms", "preference"])("la fiche périmée — %s", (name) => {
  it("refuse un geste décidé sur une fiche lue à une autre révision, sans rien écrire", async () => {
    const { companies, events, gestures } = build();

    await expect(gestures[name]?.(STALE)).rejects.toBeInstanceOf(CompanyChangedSinceReadError);

    expect(companies.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });

  it("enregistre un geste décidé sur la fiche à jour", async () => {
    const { companies, gestures } = build();

    await gestures[name]?.(CURRENT);

    expect(companies.saved).toHaveLength(1);
    // Le dépôt n'écrira qu'à cette révision : la course entre chargement et écriture.
    expect(companies.saved[0]?.readAt).toBe(CURRENT);
  });

  it("enregistre sans rien comparer quand l'appelant n'a pas lu de fiche", async () => {
    const { companies, gestures } = build();

    await gestures[name]?.(null);

    expect(companies.saved).toHaveLength(1);
    expect(companies.saved[0]?.readAt).toBeNull();
  });

  it("un rejeu à l'identique, même avec une révision dépassée, n'est pas un refus", async () => {
    const { companies, events, gestures } = build();
    await gestures[name]?.(CURRENT);
    const traced = events.traced.length;

    await expect(gestures[name]?.(STALE)).resolves.toBeUndefined();

    expect(companies.saved).toHaveLength(1);
    expect(events.traced).toHaveLength(traced);
  });
});
