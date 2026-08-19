import { CreateStaffUserHandler } from "../staff-user.handlers.js";
import { CreateStaffUserCommand } from "../staff-user.commands.js";
import type { OpenStaffAccess } from "../../../invitations/open-staff-access.service.js";
import type { StaffUserRepository } from "../../domain/staff-user.repository.js";
import type { StaffUserPayload } from "@lfd/contracts";

const PAYLOAD = {
  firstName: "Camille",
  lastName: "Roy",
  email: "camille@exemple.test",
  role: "commercial",
} as StaffUserPayload;

function repositoryStub(): StaffUserRepository {
  return { create: () => Promise.resolve("staff_1") } as unknown as StaffUserRepository;
}

describe("créer un membre de l’équipe", () => {
  it("l’invite dans la foulée — la création EST l’invitation", async () => {
    const opened: string[] = [];
    const handler = new CreateStaffUserHandler(repositoryStub(), {
      open: (id: string) => {
        opened.push(id);
        return Promise.resolve({ mailSent: true });
      },
    } as OpenStaffAccess);

    const id = await handler.execute(new CreateStaffUserCommand(PAYLOAD, "auth0|moi"));

    expect(id).toBe("staff_1");
    expect(opened).toEqual(["staff_1"]);
  });

  it("NE DÉFAIT PAS la fiche quand l’invitation échoue", async () => {
    // Perdre une saisie parce qu'un e-mail n'est pas parti serait le pire des
    // deux : la personne n'existerait pas, et il n'y aurait rien à rattraper.
    // Elle existe, et « Renvoyer le lien » reprend la main.
    const handler = new CreateStaffUserHandler(repositoryStub(), {
      open: () => Promise.reject(new Error("fournisseur d'identité injoignable")),
    } as unknown as OpenStaffAccess);

    await expect(handler.execute(new CreateStaffUserCommand(PAYLOAD, "auth0|moi"))).resolves.toBe(
      "staff_1",
    );
  });
});
