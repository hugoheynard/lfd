import type { StaffUserPayload } from "@lfd/contracts";

import { StaffIdentityPort } from "../../../invitations/staff-identity.port.js";
import type { StaffIdentityFacts } from "../../domain/staff-user.repository.js";
import { UpdateStaffUserCommand } from "../staff-user.commands.js";
import { UpdateStaffUserHandler } from "../staff-user.handlers.js";

type Deps = ConstructorParameters<typeof UpdateStaffUserHandler>;

const LINKED: StaffIdentityFacts = {
  id: "s1",
  email: "sophie@lfc.test",
  firstName: "Sophie",
  lastName: "Martin",
  auth0Id: "auth0|sophie",
  status: "active",
};

function payload(email: string): StaffUserPayload {
  return {
    firstName: "Sophie",
    lastName: "Martin",
    email,
    phone: "",
    jobTitle: "",
    role: "support",
    overrides: [],
  };
}

interface Harness {
  readonly handler: UpdateStaffUserHandler;
  readonly propagated: { subject: string; email: string }[];
  readonly written: string[];
}

function harness(before: StaffIdentityFacts, identityFails = false): Harness {
  const propagated: { subject: string; email: string }[] = [];
  const written: string[] = [];

  const staff: Pick<Deps[0], "identityOf" | "update"> = {
    identityOf: (): Promise<StaffIdentityFacts> => Promise.resolve(before),
    update: (id: string): Promise<void> => {
      written.push(id);
      return Promise.resolve();
    },
  };
  const identities: Pick<StaffIdentityPort, "changeEmail"> = {
    changeEmail: (subject: string, email: string): Promise<void> => {
      if (identityFails) {
        return Promise.reject(new Error("fournisseur indisponible"));
      }
      propagated.push({ subject, email });
      return Promise.resolve();
    },
  };

  return {
    handler: new UpdateStaffUserHandler(staff as Deps[0], identities as StaffIdentityPort),
    propagated,
    written,
  };
}

describe("UpdateStaffUserHandler — l'adresse de connexion suit l'annuaire", () => {
  it("propage une adresse changée sur une identité déjà liée", async () => {
    // Sans ça, la personne se connecterait avec son ancienne adresse pendant
    // que l'écran en afficherait une autre.
    const h = harness(LINKED);

    await h.handler.execute(new UpdateStaffUserCommand("s1", payload("s.martin@lfc.test"), "moi"));

    expect(h.propagated).toEqual([{ subject: "auth0|sophie", email: "s.martin@lfc.test" }]);
  });

  it("ne propage rien quand l'adresse n'a pas bougé", async () => {
    // Un appel inutile au fournisseur n'est pas neutre : il repasse l'adresse
    // en « non vérifiée » et déclenche un e-mail de vérification. Enregistrer un
    // formulaire ne doit pas faire ça.
    const h = harness(LINKED);

    await h.handler.execute(new UpdateStaffUserCommand("s1", payload("sophie@lfc.test"), "moi"));

    expect(h.propagated).toEqual([]);
  });

  it("compare après normalisation — la casse n'est pas un changement", async () => {
    const h = harness(LINKED);

    await h.handler.execute(new UpdateStaffUserCommand("s1", payload("  SOPHIE@LFC.TEST "), "moi"));

    expect(h.propagated).toEqual([]);
  });

  it("ne propage rien pour une fiche jamais liée", async () => {
    // Rien à réparer : l'adresse servira au premier rapprochement, et
    // l'invitation ouvrira l'identité avec la bonne.
    const h = harness({ ...LINKED, auth0Id: null, status: "pending" });

    await h.handler.execute(new UpdateStaffUserCommand("s1", payload("autre@lfc.test"), "moi"));

    expect(h.propagated).toEqual([]);
  });

  it("écrit chez nous AVANT de propager", async () => {
    // L'ordre est un compromis assumé : l'écriture locale fait tourner la
    // politique de domaine, qui peut encore refuser (admin racine renommé).
    // Propager d'abord validerait chez Auth0 un changement refusé chez nous.
    const h = harness(LINKED);

    await h.handler.execute(new UpdateStaffUserCommand("s1", payload("s.martin@lfc.test"), "moi"));

    expect(h.written).toEqual(["s1"]);
  });

  it("remonte l'échec de propagation plutôt que de l'avaler", async () => {
    // Le désaccord résiduel est tracé et l'appelant le voit : silencieux, il se
    // découvrirait des mois plus tard, le jour où quelqu'un ne peut plus entrer.
    const h = harness(LINKED, true);

    await expect(
      h.handler.execute(new UpdateStaffUserCommand("s1", payload("s.martin@lfc.test"), "moi")),
    ).rejects.toThrow("fournisseur indisponible");
  });
});
