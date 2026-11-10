import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../../platform/outbox/__tests__/transactional-durable.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  DEFAULT_DELIVERY_SET,
  DELIVERY_ADDRESS_ADDED,
  DELIVERY_ADDRESS_REMOVED,
  DELIVERY_ADDRESS_UPDATED,
} from "../../../domain/events/site-gesture.fact.js";
import type { LockedPrincipal } from "../../../domain/ports/site-principal.lock.js";
import { SiteGesturePublisher } from "../../services/site-gesture.publisher.js";
import { AddDeliveryAddressByStaffCommand } from "../add-delivery-address-by-staff.command.js";
import { AddDeliveryAddressByStaffHandler } from "../add-delivery-address-by-staff.handler.js";
import { AddDeliveryAddressHandler } from "../add-delivery-address.handler.js";
import {
  AddDeliveryAddressCommand,
  RemoveDeliveryAddressCommand,
  SetDefaultDeliveryAddressCommand,
  UpdateDeliveryAddressCommand,
} from "../address-commands.js";
import { RemoveDeliveryAddressByStaffCommand } from "../remove-delivery-address-by-staff.command.js";
import { RemoveDeliveryAddressByStaffHandler } from "../remove-delivery-address-by-staff.handler.js";
import { RemoveDeliveryAddressHandler } from "../remove-delivery-address.handler.js";
import { SetDefaultDeliveryAddressHandler } from "../set-default-delivery-address.handler.js";
import { SetDefaultDeliveryByStaffCommand } from "../set-default-delivery-by-staff.command.js";
import { SetDefaultDeliveryByStaffHandler } from "../set-default-delivery-by-staff.handler.js";
import { UpdateDeliveryAddressByStaffCommand } from "../update-delivery-address-by-staff.command.js";
import { UpdateDeliveryAddressByStaffHandler } from "../update-delivery-address-by-staff.handler.js";
import { UpdateDeliveryAddressHandler } from "../update-delivery-address.handler.js";
import {
  DELIVERY,
  InMemoryAddresses,
  InMemoryCompanies,
  journalNames,
  OwnerMembership,
  STREET,
} from "./member-acts-doubles.js";
import { FixedSitePrincipals } from "./site-gesture-doubles.js";

/** Un verrou qui note s'il a été pris DANS l'unité de travail. */
class WitnessedLock extends FixedSitePrincipals {
  readonly insideUnit: boolean[] = [];

  constructor(
    private readonly uow: TransactionalUnitOfWork,
    principals: ReadonlyMap<string, string>,
  ) {
    super(principals);
  }

  override lockedPrincipalOf(companyId: string): Promise<LockedPrincipal | null> {
    this.insideUnit.push(this.uow.isOpen);
    return super.lockedPrincipalOf(companyId);
  }
}

function build(principals: ReadonlyMap<string, string> = new Map([["c1", "alpes"]])) {
  const uow = new TransactionalUnitOfWork();
  const lock = new WitnessedLock(uow, principals);
  const gestures = new SiteGesturePublisher(
    lock,
    new FixedIdGenerator("g"),
    new TransactionalDurablePublisher(uow),
  );
  const events = new RecordingPublisher();
  const addresses = new InMemoryAddresses();
  const companies = new InMemoryCompanies();
  const names = journalNames(companies, addresses);
  const clock = new FixedClock(new Date("2026-02-03T10:00:00Z"));
  const member = new OwnerMembership();
  return { uow, lock, gestures, events, addresses, companies, names, clock, member };
}

type Built = ReturnType<typeof build>;

async function customerGestures(b: Built): Promise<string> {
  const added = await new AddDeliveryAddressHandler(
    b.member,
    b.addresses,
    b.events,
    new FixedIdGenerator("addr"),
    b.clock,
    b.uow,
    b.names,
    b.gestures,
  ).execute(new AddDeliveryAddressCommand("u1", "c1", DELIVERY));
  await new UpdateDeliveryAddressHandler(
    b.member,
    b.addresses,
    b.events,
    b.uow,
    b.names,
    b.gestures,
  ).execute(new UpdateDeliveryAddressCommand("u1", "c1", added, DELIVERY));
  await new SetDefaultDeliveryAddressHandler(
    b.member,
    b.addresses,
    b.events,
    b.uow,
    b.names,
    b.gestures,
  ).execute(new SetDefaultDeliveryAddressCommand("u1", "c1", added));
  await new RemoveDeliveryAddressHandler(
    b.member,
    b.addresses,
    b.companies,
    b.clock,
    b.events,
    b.uow,
    b.gestures,
  ).execute(new RemoveDeliveryAddressCommand("u1", "c1", "a1"));
  return added;
}

async function teamGestures(b: Built): Promise<string> {
  const added = await new AddDeliveryAddressByStaffHandler(
    b.addresses,
    b.events,
    new FixedIdGenerator("addr"),
    b.clock,
    b.uow,
    b.names,
    b.gestures,
  ).execute(new AddDeliveryAddressByStaffCommand("c1", DELIVERY));
  await new UpdateDeliveryAddressByStaffHandler(
    b.addresses,
    b.events,
    b.uow,
    b.names,
    b.gestures,
  ).execute(new UpdateDeliveryAddressByStaffCommand("c1", added, DELIVERY));
  await new SetDefaultDeliveryByStaffHandler(
    b.addresses,
    b.events,
    b.uow,
    b.names,
    b.gestures,
  ).execute(new SetDefaultDeliveryByStaffCommand("c1", added));
  await new RemoveDeliveryAddressByStaffHandler(
    b.addresses,
    b.companies,
    b.events,
    b.clock,
    b.uow,
    b.gestures,
  ).execute(new RemoveDeliveryAddressByStaffCommand("c1", "a1"));
  return added;
}

const TYPES = [
  DELIVERY_ADDRESS_ADDED,
  DELIVERY_ADDRESS_UPDATED,
  DEFAULT_DELIVERY_SET,
  DELIVERY_ADDRESS_REMOVED,
];

describe("les gestes du carnet de livraison écrivent un fait durable (N4b)", () => {
  it("geste client : un fait par geste, nommé par le geste, principal lu sous verrou, auteur le client", async () => {
    const b = build();
    const added = await customerGestures(b);

    expect(b.uow.committed.map((fact) => fact.type)).toEqual(TYPES);
    expect(b.uow.committed.map((fact) => fact.payload["subjectId"])).toEqual([
      added,
      added,
      added,
      "a1",
    ]);
    for (const fact of b.uow.committed) {
      expect(fact.payload).toMatchObject({
        siteCompanyId: "c1",
        principalCompanyId: "alpes",
        authorUserId: "u1",
        byTeam: false,
      });
    }
  });

  it("geste de l'équipe : auteur nul, `byTeam`", async () => {
    const b = build();
    await teamGestures(b);

    expect(b.uow.committed.map((fact) => fact.type)).toEqual(TYPES);
    for (const fact of b.uow.committed) {
      expect(fact.payload).toMatchObject({ authorUserId: null, byTeam: true });
    }
  });

  it("le principal est lu DANS l'unité de travail de l'écriture, à chaque geste", async () => {
    const customer = build();
    const team = build();
    await customerGestures(customer);
    await teamGestures(team);
    expect([...customer.lock.insideUnit, ...team.lock.insideUnit]).toEqual(
      Array.from({ length: 8 }, () => true),
    );
  });

  it("un compte sans principal : le fait part quand même, principal nul", async () => {
    const b = build(new Map());
    await customerGestures(b);
    expect(b.uow.committed.every((fact) => fact.payload["principalCompanyId"] === null)).toBe(true);
  });

  it("dix gestes, dix clés : aucun ne fait taire le suivant", async () => {
    const b = build();
    await customerGestures(b);
    const keys = new Set(b.uow.committed.map((fact) => fact.key));
    expect(keys.size).toBe(4);
  });

  it("ne dit rien de l'adresse (décision de Hugo, 2026-10-20)", async () => {
    const b = build();
    await customerGestures(b);
    const written = JSON.stringify(b.uow.committed);
    expect(written).not.toContain(STREET);
    expect(written).not.toContain(DELIVERY.ville);
    expect(written).not.toContain(DELIVERY.label);
    expect(written).not.toContain(DELIVERY.codePostal);
  });
});
