import type { StaffStatus } from "@lfd/contracts";

import { StaffIdentityPort } from "../../domain/staff-identity.port.js";
import { SuspendedStaffInviteError } from "../../domain/staff-user-errors.js";
import type { StaffIdentityFacts } from "../../domain/staff-user.repository.js";
import { InviteStaffUserCommand } from "../staff-user.commands.js";
import { InviteStaffUserHandler } from "../invite-staff-user.handler.js";

const NOW = new Date("2026-08-12T12:00:00.000Z");

function target(overrides: Partial<StaffIdentityFacts> = {}): StaffIdentityFacts {
  return {
    id: "s1",
    email: "sophie@lfc.test",
    firstName: "Sophie",
    lastName: "Martin",
    auth0Id: null,
    status: "pending" satisfies StaffStatus,
    ...overrides,
  };
}

interface Harness {
  readonly handler: InviteStaffUserHandler;
  readonly provisioned: string[];
  readonly relinked: string[];
  readonly marked: { id: string; subject: string; at: Date }[];
  readonly mails: { to: string; url: string }[];
}

type Deps = ConstructorParameters<typeof InviteStaffUserHandler>;

/** Panne du fournisseur d'identité, pour éprouver l'ordre des opérations. */
class IdentityDown extends Error {
  constructor() {
    super("fournisseur indisponible");
  }
}

function harness(row: StaffIdentityFacts, identityFails = false, mailerOn = true): Harness {
  const provisioned: string[] = [];
  const relinked: string[] = [];
  const marked: { id: string; subject: string; at: Date }[] = [];
  const mails: { to: string; url: string }[] = [];

  const staff: Pick<Deps[0], "identityOf" | "markInvited"> = {
    identityOf: (): Promise<StaffIdentityFacts> => Promise.resolve(row),
    markInvited: (id: string, subject: string, at: Date): Promise<void> => {
      marked.push({ id, subject, at });
      return Promise.resolve();
    },
  };
  const identities: Pick<StaffIdentityPort, "provision" | "issuePasswordLink"> = {
    provision: (input) => {
      if (identityFails) {
        return Promise.reject(new IdentityDown());
      }
      provisioned.push(input.email);
      return Promise.resolve({ subject: "auth0|neuf", passwordSetupUrl: "https://lien/neuf" });
    },
    issuePasswordLink: (subject) => {
      if (identityFails) {
        return Promise.reject(new IdentityDown());
      }
      relinked.push(subject);
      return Promise.resolve("https://lien/renvoi");
    },
  };
  // Le `send` du port est générique sur la clé de gabarit : sans annoter ici, le
  // paramètre arrive en union de tous les gabarits et `data` n'a plus de forme.
  // On déclare celui qu'on attend — un envoi d'un autre gabarit ne compilerait
  // pas, ce qui est exactement le garde qu'on veut.
  const mailer: Pick<Deps[3], "enabled" | "send"> = {
    enabled: mailerOn,
    send: (args: {
      readonly to: string;
      readonly data: { readonly passwordSetupUrl: string };
    }): Promise<void> => {
      mails.push({ to: args.to, url: args.data.passwordSetupUrl });
      return Promise.resolve();
    },
  };

  const handler = new InviteStaffUserHandler(
    staff as Deps[0],
    identities,
    { now: (): Date => NOW },
    mailer,
  );
  return { handler, provisioned, relinked, marked, mails };
}

const COMMAND = new InviteStaffUserCommand("s1", "auth0|moi");

describe("InviteStaffUserHandler — première invitation", () => {
  it("ouvre une identité, date l'invitation et envoie le lien", async () => {
    const h = harness(target());

    await h.handler.execute(COMMAND);

    expect(h.provisioned).toEqual(["sophie@lfc.test"]);
    expect(h.relinked).toEqual([]);
    expect(h.marked).toEqual([{ id: "s1", subject: "auth0|neuf", at: NOW }]);
    expect(h.mails).toEqual([{ to: "sophie@lfc.test", url: "https://lien/neuf" }]);
  });
});

describe("InviteStaffUserHandler — renvoi", () => {
  it("ne recrée pas d'identité quand elle existe déjà", async () => {
    // Le doublon d'identité est le vrai risque : deux `sub` pour une personne,
    // et le rapprochement d'annuaire devient un tirage au sort.
    const h = harness(target({ auth0Id: "auth0|deja", status: "invited" }));

    await h.handler.execute(COMMAND);

    expect(h.provisioned).toEqual([]);
    expect(h.relinked).toEqual(["auth0|deja"]);
    expect(h.mails).toEqual([{ to: "sophie@lfc.test", url: "https://lien/renvoi" }]);
  });

  it("renvoie aussi à quelqu'un déjà entré — c'est le mot de passe oublié", async () => {
    const h = harness(target({ auth0Id: "auth0|deja", status: "active" }));

    await h.handler.execute(COMMAND);

    expect(h.mails).toHaveLength(1);
  });
});

describe("InviteStaffUserHandler — suspendue", () => {
  it("refuse, sans toucher au fournisseur d'identité ni au courrier", async () => {
    // Un lien de mot de passe rouvrirait la porte que la suspension a fermée :
    // le suivre vaut entrée, et l'entrée réactive la fiche.
    const h = harness(target({ auth0Id: "auth0|deja", status: "suspended" }));

    await expect(h.handler.execute(COMMAND)).rejects.toBeInstanceOf(SuspendedStaffInviteError);

    expect(h.provisioned).toEqual([]);
    expect(h.relinked).toEqual([]);
    expect(h.marked).toEqual([]);
    expect(h.mails).toEqual([]);
  });
});

describe("InviteStaffUserHandler — ordre des opérations", () => {
  it("n'écrit pas « invitée » si le lien n'a pas pu être frappé", async () => {
    // Le lien d'abord, l'écriture ensuite. L'ordre inverse laisserait une fiche
    // qui annonce une invitation que personne n'a reçue, et l'administrateur
    // attendrait une réponse à un e-mail jamais parti.
    const h = harness(target(), true);

    await expect(h.handler.execute(COMMAND)).rejects.toBeInstanceOf(IdentityDown);

    expect(h.marked).toEqual([]);
    expect(h.mails).toEqual([]);
  });
});

describe("InviteStaffUserHandler — ce que l'écran a le droit d'annoncer", () => {
  it("dit que l'e-mail est parti quand le canal est ouvert", async () => {
    const h = harness(target());

    await expect(h.handler.execute(COMMAND)).resolves.toEqual({ mailSent: true });
  });

  it("dit qu'il n'est PAS parti quand le mailer tourne à blanc", async () => {
    // Sans clé, le mailer rend le gabarit, le journalise et n'envoie rien : il
    // ne lève donc pas. Rendre `void` faisait annoncer « lien envoyé » à
    // quelqu'un qui n'attendrait jamais rien — le lien se remet alors à la main.
    const h = harness(target(), false, false);

    await expect(h.handler.execute(COMMAND)).resolves.toEqual({ mailSent: false });
  });
});
