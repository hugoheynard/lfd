import type { StaffUserPayload } from "@lfd/contracts";

import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { SealingIntentLedger } from "../../../../platform/intent/__tests__/sealing-intent-ledger.js";
import { RecordingJournal } from "../../../../platform/journal/__tests__/recording-journal.js";
import type { OpenStaffAccess } from "../../../invitations/open-staff-access.service.js";
import { STAFF_FACTS } from "../../domain/staff-facts.js";
import { CreateStaffUserHandler } from "../create-staff-user.handler.js";
import { CreateStaffUserCommand } from "../staff-user.commands.js";
import { ScriptedStaffUsers, TrackingUnitOfWork } from "./staff-doubles.js";

const PAYLOAD: StaffUserPayload = {
  firstName: "Camille",
  lastName: "Roy",
  email: "camille@exemple.test",
  phone: "",
  jobTitle: "",
  role: "commercial",
  overrides: [],
};

const INTENT = "0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c";

interface Harness {
  readonly handler: CreateStaffUserHandler;
  readonly staff: ScriptedStaffUsers;
  readonly journal: RecordingJournal;
  readonly opened: { readonly id: string; readonly insideTransaction: boolean }[];
  readonly ledger: SealingIntentLedger;
}

function harness(options: { journalDown?: boolean; openFails?: boolean } = {}): Harness {
  const uow = new TrackingUnitOfWork();
  const staff = new ScriptedStaffUsers(uow);
  const journal = new RecordingJournal(options.journalDown ? new Error("journal en panne") : null);
  const opened: { id: string; insideTransaction: boolean }[] = [];
  const ledger = new SealingIntentLedger(() => uow.inside);
  // `OpenStaffAccess` est une classe concrète à sept dépendances : on n'en
  // double que le geste que le handler appelle.
  const access = {
    open: (id: string, _intentKey: string) => {
      opened.push({ id, insideTransaction: uow.inside });
      return options.openFails
        ? Promise.reject(new Error("fournisseur d'identité injoignable"))
        : Promise.resolve({ mailSent: true });
    },
  } as OpenStaffAccess;
  return {
    handler: new CreateStaffUserHandler(staff, access, journal, uow, inMemoryIntents(ledger)),
    staff,
    journal,
    opened,
    ledger,
  };
}

describe("créer un membre de l’équipe", () => {
  it("l’invite dans la foulée — la création EST l’invitation", async () => {
    const h = harness();

    const id = await h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi", INTENT));

    expect(id).toBe("s1");
    expect(h.opened.map((call) => call.id)).toEqual(["s1"]);
  });

  it("écrit la fiche ET son fait dans la même transaction, l'invitation HORS d'elle", async () => {
    const h = harness();

    await h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi", INTENT));

    expect(h.staff.writes).toEqual([{ method: "create", insideTransaction: true }]);
    expect(h.journal.facts).toEqual([
      {
        type: STAFF_FACTS.created,
        subjectType: "staff_user",
        subjectId: "s1",
        payload: {
          subjectLabel: "Camille Roy",
          person: { firstName: "Camille", lastName: "Roy" },
          roleLabel: "Commercial",
        },
      },
    ]);
    // Auth0 et l'e-mail sont des appels réseau : jamais dans une transaction.
    expect(h.opened).toEqual([{ id: "s1", insideTransaction: false }]);
  });

  it("n'invite personne quand le journal tombe — la création échoue", async () => {
    const h = harness({ journalDown: true });

    await expect(
      h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi", INTENT)),
    ).rejects.toThrow("journal en panne");
    expect(h.opened).toEqual([]);
  });

  /**
   * Régression (revue de S2, cas 4) : un double clic sur « Créer » créait deux
   * fiches et envoyait deux invitations.
   */
  it("un double clic de même intention ne crée qu’une fiche et n’invite qu’une fois", async () => {
    const h = harness();

    await h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi", INTENT));
    await expect(
      h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi", INTENT)),
    ).resolves.toBe("s1");

    expect(h.staff.writes).toHaveLength(1);
    expect(h.opened).toHaveLength(1);
  });

  it("NE DÉFAIT PAS la fiche quand l’invitation échoue", async () => {
    // Perdre une saisie parce qu'un e-mail n'est pas parti serait le pire des
    // deux : la personne n'existerait pas, et il n'y aurait rien à rattraper.
    // Elle existe, et « Renvoyer le lien » reprend la main.
    const h = harness({ openFails: true });

    await expect(
      h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi", INTENT)),
    ).resolves.toBe("s1");
    expect(h.journal.types()).toEqual([STAFF_FACTS.created]);
  });

  describe("une fois par intention, scellée avec la fiche", () => {
    // Régression : l'intention était résolue après la transaction ; une panne
    // entre les deux laissait expirer le bail, et le rejeu refaisait le geste.
    it("l'intention est résolue DANS la transaction de la fiche, avant l'invitation", async () => {
      const h = harness();

      await h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi", INTENT));

      expect(h.ledger.resolutions).toEqual(["in tx"]);
    });

    it("un scellement refusé fait échouer la création : rien n'est invité, la clé est rendue", async () => {
      const h = harness();
      h.ledger.refuseNextSeal = new Error("registre indisponible");

      await expect(
        h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi", INTENT)),
      ).rejects.toThrow("registre indisponible");
      expect(h.opened).toEqual([]);
      await expect(
        h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi", INTENT)),
      ).resolves.toBe("s1");
    });

    it("une écriture qui tombe ne scelle rien", async () => {
      const h = harness({ journalDown: true });

      await expect(
        h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi", INTENT)),
      ).rejects.toThrow("journal en panne");
      expect(h.ledger.resolutions).toEqual([]);
    });

    it("rejouée après un succès : la fiche n'est pas recréée, rien n'est rescellé", async () => {
      const h = harness();

      await h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi", INTENT));
      await h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi", INTENT));

      expect(h.staff.writes).toHaveLength(1);
      expect(h.ledger.resolutions).toEqual(["in tx"]);
    });
  });
});
