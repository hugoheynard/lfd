import type { UserProfile } from "../../../domain/entities/user-profile.js";
import {
  EmailAlreadyUsedError,
  UserProfileNotFoundError,
} from "../../../domain/errors/account-errors.js";
import { CustomerIdentityPort } from "../../../domain/ports/customer-identity.port.js";
import {
  UserProfileRepository,
  type UserProfileRecord,
} from "../../../domain/ports/user-profile.repository.js";
import { UpdateMyProfileCommand } from "../update-my-profile.command.js";
import { UpdateMyProfileHandler } from "../update-my-profile.handler.js";

const STORED: UserProfileRecord = {
  userId: "user_1",
  firstName: "Camille",
  lastName: "Rousseau",
  email: "camille@ancienne.fr",
  phone: "",
};

/** Trace de tout ce que le handler fait franchir ses ports, dans l'ordre. */
interface Journal {
  readonly calls: string[];
  readonly saved: UserProfile[];
}

interface Doubles {
  readonly handler: UpdateMyProfileHandler;
  readonly journal: Journal;
}

function doubles(
  options: {
    stored?: UserProfileRecord | null;
    emailOwner?: string | null;
    identityFails?: boolean;
  } = {},
): Doubles {
  const journal: Journal = { calls: [], saved: [] };
  const stored = options.stored === undefined ? STORED : options.stored;

  const profiles: UserProfileRepository = {
    findById: () => Promise.resolve(stored),
    findIdByEmail: () => Promise.resolve(options.emailOwner ?? null),
    save: (_userId, profile) => {
      journal.calls.push("save");
      journal.saved.push(profile);
      return Promise.resolve();
    },
  };

  const identity: CustomerIdentityPort = {
    changeEmail: () => {
      journal.calls.push("identity");
      return options.identityFails === true
        ? Promise.reject(new Error("fournisseur indisponible"))
        : Promise.resolve();
    },
  };

  return { handler: new UpdateMyProfileHandler(profiles, identity), journal };
}

function command(overrides: Partial<UpdateMyProfileCommand> = {}): UpdateMyProfileCommand {
  return new UpdateMyProfileCommand(
    overrides.userId ?? "user_1",
    overrides.subject ?? "auth0|1",
    overrides.firstName ?? "Camille",
    overrides.lastName ?? "Rousseau",
    overrides.email ?? "camille@ancienne.fr",
    overrides.phone ?? "",
  );
}

describe("UpdateMyProfileHandler", () => {
  it("écrit le profil sans toucher au fournisseur quand l'e-mail est inchangé", async () => {
    const { handler, journal } = doubles();

    await handler.execute(command({ lastName: "Rousseau-Benali" }));

    expect(journal.calls).toEqual(["save"]);
    expect(journal.saved[0]?.lastName.value).toBe("Rousseau-Benali");
  });

  it("propage l'e-mail AVANT d'écrire chez nous", async () => {
    const { handler, journal } = doubles();

    await handler.execute(command({ email: "camille@nouvelle.fr" }));

    // L'ordre est l'invariant : Auth0 authentifie avec cette adresse.
    expect(journal.calls).toEqual(["identity", "save"]);
  });

  it("n'écrit RIEN chez nous si la propagation échoue", async () => {
    const { handler, journal } = doubles({ identityFails: true });

    await expect(handler.execute(command({ email: "camille@nouvelle.fr" }))).rejects.toThrow(
      /indisponible/u,
    );

    expect(journal.calls).toEqual(["identity"]);
    expect(journal.saved).toEqual([]);
  });

  it("refuse un e-mail détenu par un autre compte, sans appeler le fournisseur", async () => {
    const { handler, journal } = doubles({ emailOwner: "user_2" });

    await expect(handler.execute(command({ email: "occupe@client.fr" }))).rejects.toBeInstanceOf(
      EmailAlreadyUsedError,
    );

    expect(journal.calls).toEqual([]);
  });

  it("accepte de retrouver l'adresse sur SON propre compte", async () => {
    // Régression possible du contrôle d'unicité : chercher le propriétaire de
    // l'adresse et refuser dès qu'on en trouve un bloquerait l'utilisateur sur son
    // propre e-mail, donc tout renommage.
    const { handler, journal } = doubles({ emailOwner: "user_1" });

    await handler.execute(command({ email: "camille@ancienne.fr", lastName: "Benali" }));

    expect(journal.calls).toEqual(["save"]);
  });

  it("refuse d'éditer un profil qui n'existe pas", async () => {
    const { handler } = doubles({ stored: null });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(UserProfileNotFoundError);
  });
});
