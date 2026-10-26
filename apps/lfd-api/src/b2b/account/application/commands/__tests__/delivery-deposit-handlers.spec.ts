import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { UpdateDeliveryAddressCommand } from "../address-commands.js";
import { UpdateDeliveryAddressHandler } from "../update-delivery-address.handler.js";
import {
  COMPANY_LABEL,
  DELIVERY,
  InMemoryAddresses,
  InMemoryCompanies,
  journalNames,
  OwnerMembership,
} from "./member-acts-doubles.js";
import { silentGestures } from "./site-gesture-doubles.js";

/**
 * **« Dépôt autorisé »** (`documentation/livraisons/livreur/a-la-porte.md`, AP-D5) :
 * réglé par le client sur la route d'édition de son adresse. Absent de sa
 * charge, il reste INCHANGÉ. La route du staff a été retirée le 2026-10-26
 * (décision de Hugo) : la règle du dépôt ne lit plus ce réglage.
 */
function build() {
  const events = new RecordingPublisher();
  const addresses = new InMemoryAddresses();
  const names = journalNames(new InMemoryCompanies(), addresses);
  const member = new UpdateDeliveryAddressHandler(
    new OwnerMembership(),
    addresses,
    events,
    new DirectUnitOfWork(),
    names,
    silentGestures(),
  );
  return { events, addresses, member };
}

async function depositOf(addresses: InMemoryAddresses): Promise<boolean | undefined> {
  return (await addresses.loadDeliveryBook()).deliveries()[0]?.depositAllowed;
}

const DEPOSIT_FACT = {
  type: "company.delivery_deposit_set",
  subjectType: "company",
  subjectId: "c1",
  payload: {
    subjectLabel: COMPANY_LABEL,
    address: { id: "a1", ville: DELIVERY.ville, codePostal: DELIVERY.codePostal },
    depositAllowed: true,
  },
};

describe("« dépôt autorisé », par le client (AP-D5)", () => {
  it("le client l'autorise en éditant son adresse : un fait de plus, à part", async () => {
    const { events, addresses, member } = build();

    await member.execute(new UpdateDeliveryAddressCommand("u1", "c1", "a1", DELIVERY, true));

    expect(await depositOf(addresses)).toBe(true);
    expect(events.factTypes()).toEqual([
      "company.delivery_address_updated",
      "company.delivery_deposit_set",
    ]);
    expect(events.traced[1]?.journalFact()).toEqual(DEPOSIT_FACT);
  });

  it("🔴 une édition qui ne l'envoie pas ne le remet jamais à `false`", async () => {
    const { events, addresses, member } = build();
    await member.execute(new UpdateDeliveryAddressCommand("u1", "c1", "a1", DELIVERY, true));

    await member.execute(new UpdateDeliveryAddressCommand("u1", "c1", "a1", DELIVERY));

    expect(await depositOf(addresses)).toBe(true);
    expect(events.factTypes().at(-1)).toBe("company.delivery_address_updated");
  });
});
