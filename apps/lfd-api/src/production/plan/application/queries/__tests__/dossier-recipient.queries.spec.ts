import {
  Directory,
  Reachable,
  RecipientsRows,
  staffCard,
} from "../../__tests__/dossier-recipient-doubles.js";
import { ListDossierRecipientsHandler } from "../list-dossier-recipients.handler.js";
import { ListDossierStaffCandidatesHandler } from "../list-dossier-staff-candidates.handler.js";

describe("ListDossierRecipientsHandler", () => {
  it("relit les fiches du personnel et rend les externes tels quels", async () => {
    const directory = new Directory()
      .put(staffCard())
      .put(staffCard({ staffUserId: "s-off", firstName: "Léa", jobTitle: "", active: false }));
    const handler = new ListDossierRecipientsHandler(
      new RecipientsRows([
        { id: "r-1", kind: "staff", staffUserId: "s-paul" },
        {
          id: "r-2",
          kind: "external",
          email: "j@x.fr",
          firstName: "Jeanne",
          lastName: "Roux",
          jobTitle: null,
        },
        { id: "r-3", kind: "staff", staffUserId: "s-off" },
        { id: "r-4", kind: "staff", staffUserId: "s-gone" },
      ]),
      directory,
    );

    expect(await handler.execute()).toEqual([
      {
        id: "r-1",
        kind: "staff",
        email: "paul@fournil.fr",
        firstName: "Paul",
        lastName: "Martin",
        jobTitle: "Chef",
        staffUserId: "s-paul",
        inactive: false,
      },
      {
        id: "r-2",
        kind: "external",
        email: "j@x.fr",
        firstName: "Jeanne",
        lastName: "Roux",
        jobTitle: null,
        staffUserId: null,
      },
      {
        id: "r-3",
        kind: "staff",
        email: "paul@fournil.fr",
        firstName: "Léa",
        lastName: "Martin",
        jobTitle: null,
        staffUserId: "s-off",
        inactive: true,
      },
      {
        id: "r-4",
        kind: "staff",
        email: "",
        firstName: "",
        lastName: "",
        jobTitle: null,
        staffUserId: "s-gone",
        inactive: true,
      },
    ]);
  });
});

describe("ListDossierStaffCandidatesHandler", () => {
  it("ne rend que ce que le choix demande, poste vide en null", async () => {
    const handler = new ListDossierStaffCandidatesHandler(
      new Reachable([staffCard(), staffCard({ staffUserId: "s-2", jobTitle: "" })]),
    );
    expect(await handler.execute()).toEqual([
      {
        staffUserId: "s-paul",
        firstName: "Paul",
        lastName: "Martin",
        email: "paul@fournil.fr",
        jobTitle: "Chef",
      },
      {
        staffUserId: "s-2",
        firstName: "Paul",
        lastName: "Martin",
        email: "paul@fournil.fr",
        jobTitle: null,
      },
    ]);
  });
});
