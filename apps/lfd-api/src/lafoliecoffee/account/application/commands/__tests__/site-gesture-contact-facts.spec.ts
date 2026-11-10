import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../../platform/outbox/__tests__/transactional-durable.js";
import {
  CONTACT_ADDED,
  CONTACT_REMOVED,
  CONTACT_UPDATED,
  PRIMARY_CONTACT_CHANGED,
} from "../../../domain/events/site-gesture.fact.js";
import type { LockedPrincipal } from "../../../domain/ports/site-principal.lock.js";
import { CompanyContactBook } from "../../services/company-contact-book.service.js";
import { SiteGesturePublisher } from "../../services/site-gesture.publisher.js";
import { AddCompanyContactHandler } from "../add-company-contact.handler.js";
import { AddContactByStaffCommand } from "../add-contact-by-staff.command.js";
import { AddContactByStaffHandler } from "../add-contact-by-staff.handler.js";
import {
  AddCompanyContactCommand,
  RemoveCompanyContactCommand,
  UpdateCompanyContactCommand,
  UpdatePrimaryContactCommand,
} from "../contact-commands.js";
import { RemoveCompanyContactHandler } from "../remove-company-contact.handler.js";
import { RemoveContactByStaffCommand } from "../remove-contact-by-staff.command.js";
import { RemoveContactByStaffHandler } from "../remove-contact-by-staff.handler.js";
import { UpdateCompanyContactHandler } from "../update-company-contact.handler.js";
import { UpdateContactByStaffCommand } from "../update-contact-by-staff.command.js";
import { UpdateContactByStaffHandler } from "../update-contact-by-staff.handler.js";
import { UpdatePrimaryContactByStaffCommand } from "../update-primary-contact-by-staff.command.js";
import { UpdatePrimaryContactByStaffHandler } from "../update-primary-contact-by-staff.handler.js";
import { UpdatePrimaryContactHandler } from "../update-primary-contact.handler.js";
import {
  EMAIL,
  InMemoryAddresses,
  InMemoryCompanies,
  InMemoryContacts,
  journalNames,
  NoKnownMembers,
  OwnerMembership,
  PHONE,
} from "./member-acts-doubles.js";
import { FixedSitePrincipals } from "./site-gesture-doubles.js";

/**
 * N4c (`plan-notifications-sous-comptes.md`) : les contacts n'avaient AUCUN
 * verrou sur la ligne du site — c'est le cas que `vitruve` a nommé. Le
 * principal y est lu par `SitePrincipalLock`, dans l'unité de travail.
 */
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

const DETAILS = {
  firstName: "Karim",
  lastName: "Benali",
  fonction: "Économe",
  email: EMAIL,
  phone: PHONE,
};

function build(principals: ReadonlyMap<string, string> = new Map([["c1", "alpes"]])) {
  const uow = new TransactionalUnitOfWork();
  const lock = new WitnessedLock(uow, principals);
  const gestures = new SiteGesturePublisher(
    lock,
    new FixedIdGenerator("g"),
    new TransactionalDurablePublisher(uow),
  );
  const companies = new InMemoryCompanies();
  const contacts = new InMemoryContacts();
  const book = new CompanyContactBook(companies, contacts, new NoKnownMembers());
  const names = journalNames(companies, new InMemoryAddresses());
  const events = new RecordingPublisher();
  return { uow, lock, gestures, companies, contacts, book, names, events };
}

type Built = ReturnType<typeof build>;

async function customerGestures(b: Built): Promise<string> {
  const member = new OwnerMembership();
  const contactId = await new AddCompanyContactHandler(
    member,
    b.book,
    b.events,
    b.uow,
    b.names,
    b.gestures,
  ).execute(new AddCompanyContactCommand("u1", "c1", DETAILS, "orders"));
  await new UpdateCompanyContactHandler(
    member,
    b.book,
    b.events,
    b.uow,
    b.names,
    b.gestures,
  ).execute(new UpdateCompanyContactCommand("u1", "c1", contactId, DETAILS, "admin"));
  await new RemoveCompanyContactHandler(
    member,
    b.contacts,
    b.events,
    b.uow,
    b.names,
    b.gestures,
  ).execute(new RemoveCompanyContactCommand("u1", "c1", contactId));
  await new UpdatePrimaryContactHandler(member, b.companies, b.events, b.uow, b.gestures).execute(
    new UpdatePrimaryContactCommand("u1", "c1", DETAILS),
  );
  return contactId;
}

async function teamGestures(b: Built): Promise<string> {
  const contactId = await new AddContactByStaffHandler(
    b.book,
    b.events,
    b.uow,
    b.names,
    b.gestures,
  ).execute(new AddContactByStaffCommand("c1", DETAILS, "orders"));
  await new UpdateContactByStaffHandler(b.book, b.events, b.uow, b.names, b.gestures).execute(
    new UpdateContactByStaffCommand("c1", contactId, DETAILS, "admin"),
  );
  await new RemoveContactByStaffHandler(b.contacts, b.events, b.uow, b.names, b.gestures).execute(
    new RemoveContactByStaffCommand("c1", contactId),
  );
  await new UpdatePrimaryContactByStaffHandler(b.companies, b.events, b.uow, b.gestures).execute(
    new UpdatePrimaryContactByStaffCommand("c1", DETAILS),
  );
  return contactId;
}

const TYPES = [CONTACT_ADDED, CONTACT_UPDATED, CONTACT_REMOVED, PRIMARY_CONTACT_CHANGED];

describe("les gestes sur les contacts écrivent un fait durable (N4c)", () => {
  it("geste client : un fait par geste, nommé par le geste, principal lu sous verrou, auteur le client", async () => {
    const b = build();
    const contactId = await customerGestures(b);

    expect(b.uow.committed.map((fact) => fact.type)).toEqual(TYPES);
    expect(b.uow.committed.map((fact) => fact.payload["subjectId"])).toEqual([
      contactId,
      contactId,
      contactId,
      "c1",
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

  it("un compte sans principal : le fait part, principal nul", async () => {
    const b = build(new Map());
    await customerGestures(b);
    expect(b.uow.committed.every((fact) => fact.payload["principalCompanyId"] === null)).toBe(true);
  });

  it("ne nomme personne : ni nom, ni fonction, ni e-mail, ni téléphone, ni rôle", async () => {
    const customer = build();
    const team = build();
    await customerGestures(customer);
    await teamGestures(team);
    const written = JSON.stringify([...customer.uow.committed, ...team.uow.committed]);
    for (const secret of ["Karim", "Benali", "Économe", EMAIL, PHONE, "orders", '"admin"']) {
      expect(written).not.toContain(secret);
    }
  });
});
