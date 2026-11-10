import {
  DEFAULT_CONTACT_SETTINGS,
  type ContactPhoneView,
  type ContactSettingsView,
  type PublicContactPhoneView,
} from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ContactPhone } from "../../../domain/contact-phone.js";
import type { ContactSettings } from "../../../domain/contact-settings.js";
import { ContactCardUnreachableError } from "../../../domain/errors/contact-errors.js";
import { ContactPhoneReader } from "../../../domain/ports/contact-phone.reader.js";
import { ContactPhoneRepository } from "../../../domain/ports/contact-phone.repository.js";
import { ContactSettingsReader } from "../../../domain/ports/contact-settings.reader.js";
import { ContactSettingsRepository } from "../../../domain/ports/contact-settings.repository.js";
import { AT } from "../../../domain/__tests__/request-fixtures.js";
import { ArchiveContactPhoneCommand } from "../archive-contact-phone.command.js";
import { ArchiveContactPhoneHandler } from "../archive-contact-phone.handler.js";
import { ReviseContactPhoneCommand } from "../revise-contact-phone.command.js";
import { ReviseContactPhoneHandler } from "../revise-contact-phone.handler.js";
import { UpdateContactSettingsCommand } from "../update-contact-settings.command.js";
import { UpdateContactSettingsHandler } from "../update-contact-settings.handler.js";
import { Directory } from "./contact-doubles.js";

/**
 * Décision de Hugo du 2026-10-26 : une carte qui affiche le numéro sans en
 * avoir, formulaire coupé et sans message, ne doit pas exister — ni en la
 * posant, ni en retirant le dernier numéro de sa clientèle.
 */

const LABEL = { fr: "Particuliers", en: "", it: "" };

/** Les numéros en mémoire : le port d'écriture ET le port de lecture lisent la même liste. */
class Phones {
  readonly rows = new Map<string, ContactPhone>();
  readonly saved: ContactPhone[] = [];

  add(id: string, audience: ContactPhoneView["audience"]): void {
    this.rows.set(
      id,
      ContactPhone.create({
        id,
        label: LABEL,
        number: "04 79 00 00 01",
        audience,
        position: 0,
        active: true,
        at: AT,
      }),
    );
  }

  views(): ContactPhoneView[] {
    return [...this.rows.values()]
      .map((phone) => phone.toPersistence())
      .filter((state) => state.archivedAt === null)
      .map(({ id, label, number, audience, position, active }) => ({
        id,
        label,
        number,
        audience,
        position,
        active,
      }));
  }
}

class PhoneRepo extends ContactPhoneRepository {
  constructor(private readonly phones: Phones) {
    super();
  }
  load(id: string): Promise<ContactPhone | null> {
    const row = this.phones.rows.get(id);
    return Promise.resolve(row === undefined ? null : ContactPhone.rehydrate(row.toPersistence()));
  }
  save(phone: ContactPhone): Promise<void> {
    this.phones.saved.push(phone);
    return Promise.resolve();
  }
}

class PhoneList extends ContactPhoneReader {
  constructor(private readonly phones: Phones) {
    super();
  }
  list(): Promise<ContactPhoneView[]> {
    return Promise.resolve(this.phones.views());
  }
  published(): Promise<PublicContactPhoneView[]> {
    return Promise.resolve(this.phones.views().filter((p) => p.active));
  }
}

class Settings extends ContactSettingsReader {
  constructor(private readonly view: ContactSettingsView) {
    super();
  }
  current(): Promise<ContactSettingsView> {
    return Promise.resolve(this.view);
  }
}

class SettingsRepo extends ContactSettingsRepository {
  readonly posed: ContactSettings[] = [];
  put(settings: ContactSettings): Promise<void> {
    this.posed.push(settings);
    return Promise.resolve();
  }
}

/** La carte particuliers : numéro affiché, formulaire coupé, sans message. */
const PHONE_ONLY: ContactSettingsView = {
  ...DEFAULT_CONTACT_SETTINGS,
  cards: {
    ...DEFAULT_CONTACT_SETTINGS.cards,
    b2c: { ...DEFAULT_CONTACT_SETTINGS.cards.b2c, showForm: false },
  },
};

const clock = new FixedClock(AT);

describe("UpdateContactSettingsHandler — une carte qui affiche le numéro en a un", () => {
  const update = (phones: Phones, repo: SettingsRepo) =>
    new UpdateContactSettingsHandler(
      repo,
      new PhoneList(phones),
      new Directory(null),
      clock,
    ).execute(new UpdateContactSettingsCommand({ cards: PHONE_ONLY.cards }, "staff_1"));

  it("refuse sans numéro pour la clientèle : rien posé", async () => {
    const phones = new Phones();
    phones.add("p1", "b2b");
    const repo = new SettingsRepo();
    await expect(update(phones, repo)).rejects.toThrow(ContactCardUnreachableError);
    expect(repo.posed).toHaveLength(0);
  });

  it("pose quand un numéro `both` sert la clientèle", async () => {
    const phones = new Phones();
    phones.add("p1", "both");
    const repo = new SettingsRepo();
    await update(phones, repo);
    expect(repo.posed).toHaveLength(1);
  });
});

describe("retirer le dernier numéro d'une carte sans autre geste", () => {
  const setup = () => {
    const phones = new Phones();
    phones.add("p1", "b2c");
    return phones;
  };

  it("archiver le dernier numéro particuliers est refusé : rien enregistré", async () => {
    const phones = setup();
    const handler = new ArchiveContactPhoneHandler(
      new PhoneRepo(phones),
      new PhoneList(phones),
      new Settings(PHONE_ONLY),
      clock,
    );
    await expect(handler.execute(new ArchiveContactPhoneCommand("p1"))).rejects.toThrow(
      /Ajoutez un numéro, réaffichez le formulaire ou écrivez un message/u,
    );
    expect(phones.saved).toHaveLength(0);
  });

  it("le désactiver, ou le passer aux pros, l'est aussi", async () => {
    const phones = setup();
    const handler = new ReviseContactPhoneHandler(
      new PhoneRepo(phones),
      new PhoneList(phones),
      new Settings(PHONE_ONLY),
      clock,
    );
    const base = { label: LABEL, number: "04 79 00 00 01", position: 0 };
    await expect(
      handler.execute(
        new ReviseContactPhoneCommand("p1", { ...base, audience: "b2c", active: false }),
      ),
    ).rejects.toThrow(ContactCardUnreachableError);
    await expect(
      handler.execute(
        new ReviseContactPhoneCommand("p1", { ...base, audience: "b2b", active: true }),
      ),
    ).rejects.toThrow(ContactCardUnreachableError);
    expect(phones.saved).toHaveLength(0);
  });

  it("archiver passe quand la carte a son formulaire", async () => {
    const phones = setup();
    const handler = new ArchiveContactPhoneHandler(
      new PhoneRepo(phones),
      new PhoneList(phones),
      new Settings(DEFAULT_CONTACT_SETTINGS),
      clock,
    );
    await handler.execute(new ArchiveContactPhoneCommand("p1"));
    expect(phones.saved).toHaveLength(1);
  });
});
