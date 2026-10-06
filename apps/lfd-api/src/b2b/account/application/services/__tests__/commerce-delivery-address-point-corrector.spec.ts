import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { CompanyAddressNotFoundError } from "../../../domain/errors/account-errors.js";
import { InvalidAddressPointError } from "../../../domain/errors/address-point-errors.js";
import {
  COMPANY_LABEL,
  DELIVERY,
  InMemoryAddresses,
  InMemoryCompanies,
  journalNames,
} from "../../commands/__tests__/member-acts-doubles.js";
import { CommerceDeliveryAddressPointCorrector } from "../commerce-delivery-address-point-corrector.js";

/**
 * **Le carnet corrigé à la demande de la livraison**
 * (`gps-y-aller-et-position.md`, §6) : le carnet écrit, le commerce
 * journalise `company.delivery_address_point_corrected` — sans coordonnées.
 */
function build() {
  const events = new RecordingPublisher();
  const addresses = new InMemoryAddresses();
  const corrector = new CommerceDeliveryAddressPointCorrector(
    addresses,
    events,
    new DirectUnitOfWork(),
    journalNames(new InMemoryCompanies(), addresses),
  );
  return { events, addresses, corrector };
}

const ADDRESS = { id: "a1", ville: DELIVERY.ville, codePostal: DELIVERY.codePostal };
const DOOR = { lat: 45.5651, lng: 5.9182 };
const PARKING = { lat: 45.5655, lng: 5.919 };

describe("CommerceDeliveryAddressPointCorrector — la correction d'un point du carnet", () => {
  it("pose la porte comme point GPS des consignes, et journalise sans coordonnées", async () => {
    const { events, addresses, corrector } = build();

    await corrector.correct({ companyId: "c1", addressId: "a1", kind: "door", point: DOOR });

    const entry = (await addresses.loadDeliveryBook()).deliveries()[0];
    expect(entry?.specs.gps).toEqual(DOOR);
    expect(entry?.parking).toBeNull();
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "company.delivery_address_point_corrected",
        subjectType: "company",
        subjectId: "c1",
        payload: { subjectLabel: COMPANY_LABEL, address: ADDRESS, point: "door" },
      },
    ]);
  });

  it("pose le stationnement à part, sans toucher la porte", async () => {
    const { addresses, corrector } = build();

    await corrector.correct({ companyId: "c1", addressId: "a1", kind: "parking", point: PARKING });

    const entry = (await addresses.loadDeliveryBook()).deliveries()[0];
    expect(entry?.parking).toEqual(PARKING);
    expect(entry?.specs.gps).toEqual(DELIVERY.specs.gps);
  });

  it("un point déjà en place n'écrit rien et ne journalise rien", async () => {
    const { events, corrector } = build();
    await corrector.correct({ companyId: "c1", addressId: "a1", kind: "door", point: DOOR });

    await corrector.correct({ companyId: "c1", addressId: "a1", kind: "door", point: DOOR });

    expect(events.traced).toHaveLength(1);
  });

  it("refuse une adresse absente du carnet — rien n'est journalisé", async () => {
    const { events, corrector } = build();

    await expect(
      corrector.correct({ companyId: "c1", addressId: "ailleurs", kind: "door", point: DOOR }),
    ).rejects.toBeInstanceOf(CompanyAddressNotFoundError);
    expect(events.traced).toHaveLength(0);
  });

  it("refuse un point hors des bornes terrestres", async () => {
    const { corrector } = build();

    await expect(
      corrector.correct({
        companyId: "c1",
        addressId: "a1",
        kind: "parking",
        point: { lat: 91, lng: 0 },
      }),
    ).rejects.toBeInstanceOf(InvalidAddressPointError);
  });
});
