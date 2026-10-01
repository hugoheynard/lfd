import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { CompanyAddressNotFoundError } from "../../../domain/errors/account-errors.js";
import { SetDeliveryDoorstepRuleByStaffCommand } from "../set-delivery-doorstep-rule-by-staff.command.js";
import { SetDeliveryDoorstepRuleByStaffHandler } from "../set-delivery-doorstep-rule-by-staff.handler.js";
import {
  COMPANY_LABEL,
  DELIVERY,
  InMemoryAddresses,
  InMemoryCompanies,
  journalNames,
} from "./member-acts-doubles.js";

/**
 * **La décision réglée d'avance à la porte, par adresse**
 * (`documentation/livraisons/plan-a-la-porte.md`, B3 bis, LB-Q6) — le
 * commercial la redéfinit, ou la rend au réglage global (`null`).
 */
function build() {
  const events = new RecordingPublisher();
  const addresses = new InMemoryAddresses();
  const staff = new SetDeliveryDoorstepRuleByStaffHandler(
    addresses,
    events,
    new DirectUnitOfWork(),
    journalNames(new InMemoryCompanies(), addresses),
  );
  return { events, addresses, staff };
}

const ADDRESS = { id: "a1", ville: DELIVERY.ville, codePostal: DELIVERY.codePostal };

describe("la règle d'avance à la porte d'une adresse, par le commercial (B3 bis)", () => {
  it("se redéfinit puis se rend au réglage global : un fait chaque fois", async () => {
    const { events, addresses, staff } = build();

    await staff.execute(new SetDeliveryDoorstepRuleByStaffCommand("c1", "a1", "bring_back"));
    expect((await addresses.loadDeliveryBook()).deliveries()[0]?.doorstepRule).toBe("bring_back");

    await staff.execute(new SetDeliveryDoorstepRuleByStaffCommand("c1", "a1", null));

    expect((await addresses.loadDeliveryBook()).deliveries()[0]?.doorstepRule).toBeNull();
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "company.delivery_doorstep_rule_set",
        subjectType: "company",
        subjectId: "c1",
        payload: { subjectLabel: COMPANY_LABEL, address: ADDRESS, rule: "bring_back" },
      },
      {
        type: "company.delivery_doorstep_rule_set",
        subjectType: "company",
        subjectId: "c1",
        payload: { subjectLabel: COMPANY_LABEL, address: ADDRESS, rule: null },
      },
    ]);
  });

  it("inchangée, rien ne s'écrit ni ne se journalise", async () => {
    const { events, addresses, staff } = build();

    await staff.execute(new SetDeliveryDoorstepRuleByStaffCommand("c1", "a1", null));

    expect(addresses.writes).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("ne touche pas une adresse qui n'est pas à cette société", async () => {
    const { staff, addresses } = build();

    await expect(
      staff.execute(new SetDeliveryDoorstepRuleByStaffCommand("c1", "ailleurs", "deposit")),
    ).rejects.toBeInstanceOf(CompanyAddressNotFoundError);
    expect(addresses.writes).toEqual([]);
  });
});
