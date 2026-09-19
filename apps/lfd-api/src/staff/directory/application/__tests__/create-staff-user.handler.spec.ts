import type { StaffUserPayload } from "@lfd/contracts";

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

interface Harness {
  readonly handler: CreateStaffUserHandler;
  readonly staff: ScriptedStaffUsers;
  readonly journal: RecordingJournal;
  readonly opened: { readonly id: string; readonly insideTransaction: boolean }[];
}

function harness(options: { journalDown?: boolean; openFails?: boolean } = {}): Harness {
  const uow = new TrackingUnitOfWork();
  const staff = new ScriptedStaffUsers(uow);
  const journal = new RecordingJournal(options.journalDown ? new Error("journal en panne") : null);
  const opened: { id: string; insideTransaction: boolean }[] = [];
  // `OpenStaffAccess` est une classe concrète à sept dépendances : on n'en
  // double que le geste que le handler appelle.
  const access = {
    open: (id: string) => {
      opened.push({ id, insideTransaction: uow.inside });
      return options.openFails
        ? Promise.reject(new Error("fournisseur d'identité injoignable"))
        : Promise.resolve({ mailSent: true });
    },
  } as OpenStaffAccess;
  return {
    handler: new CreateStaffUserHandler(staff, access, journal, uow),
    staff,
    journal,
    opened,
  };
}

describe("créer un membre de l’équipe", () => {
  it("l’invite dans la foulée — la création EST l’invitation", async () => {
    const h = harness();

    const id = await h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi"));

    expect(id).toBe("s1");
    expect(h.opened.map((call) => call.id)).toEqual(["s1"]);
  });

  it("écrit la fiche ET son fait dans la même transaction, l'invitation HORS d'elle", async () => {
    const h = harness();

    await h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi"));

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
      h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi")),
    ).rejects.toThrow("journal en panne");
    expect(h.opened).toEqual([]);
  });

  it("NE DÉFAIT PAS la fiche quand l’invitation échoue", async () => {
    // Perdre une saisie parce qu'un e-mail n'est pas parti serait le pire des
    // deux : la personne n'existerait pas, et il n'y aurait rien à rattraper.
    // Elle existe, et « Renvoyer le lien » reprend la main.
    const h = harness({ openFails: true });

    await expect(h.handler.execute(new CreateStaffUserCommand(PAYLOAD, "staff_moi"))).resolves.toBe(
      "s1",
    );
    expect(h.journal.types()).toEqual([STAFF_FACTS.created]);
  });
});
