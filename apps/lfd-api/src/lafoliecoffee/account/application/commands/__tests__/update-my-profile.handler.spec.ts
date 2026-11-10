import { NO_LOGIN_METHODS } from "../../../domain/ports/__tests__/login-method-doubles.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
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
import { RecordingMarketingConsent } from "../../../../../mail/channels/marketing/__tests__/recording-marketing-consent.js";
import { HeldAfterCommit } from "../../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { AccountMarketingConsent } from "../../services/account-marketing-consent.js";
import type { ProvisionedIdentity } from "../../../../../platform/shared/identity/provisioned-identity.js";

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
  readonly marketing: RecordingMarketingConsent;
  readonly afterCommit: HeldAfterCommit;
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
    // Ce double n'éprouve pas les méthodes de connexion.
    ...NO_LOGIN_METHODS,
    provision: (): Promise<ProvisionedIdentity> =>
      Promise.resolve({ subject: "auth0|double", passwordSetupUrl: "https://exemple.test/mdp" }),
    issuePasswordLink: (): Promise<string> => Promise.resolve("https://exemple.test/mdp"),

    changeEmail: () => {
      journal.calls.push("identity");
      return options.identityFails === true
        ? Promise.reject(new Error("fournisseur indisponible"))
        : Promise.resolve();
    },
  };

  const marketing = new RecordingMarketingConsent();
  const afterCommit = new HeldAfterCommit();
  return {
    handler: new UpdateMyProfileHandler(
      profiles,
      identity,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
      new AccountMarketingConsent(marketing, afterCommit, new BackgroundWork()),
    ),
    journal,
    marketing,
    afterCommit,
  };
}

function command(overrides: Partial<UpdateMyProfileCommand> = {}): UpdateMyProfileCommand {
  return new UpdateMyProfileCommand(
    overrides.userId ?? "user_1",
    overrides.subject ?? "auth0|1",
    overrides.firstName ?? "Camille",
    overrides.lastName ?? "Rousseau",
    overrides.email ?? "camille@ancienne.fr",
    overrides.phone ?? "",
    overrides.signupConsent ?? null,
  );
}

const SIGNUP_ANSWER = { accepted: true, textVersion: "society.v1", locale: "fr" } as const;

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

  /**
   * Régression : changer d'adresse laissait `users.email_verified` intact, si
   * bien qu'une personne vérifiée le restait sur n'importe quelle adresse
   * (2026-09-14). Le handler remet au port un profil qui SAIT qu'il change
   * d'adresse ; c'est ce que l'adaptateur lit pour faire retomber la preuve.
   */
  it("remet au port un profil qui annonce le changement d'adresse", async () => {
    const { handler, journal } = doubles();

    await handler.execute(command({ email: "camille@nouvelle.fr" }));

    expect(journal.saved[0]?.emailChanged).toBe(true);
  });

  it("n'annonce aucun changement d'adresse sur un simple renommage", async () => {
    const { handler, journal } = doubles();

    await handler.execute(command({ lastName: "Benali", email: "CAMILLE@ancienne.fr" }));

    expect(journal.saved[0]?.emailChanged).toBe(false);
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

/**
 * Le registre marketing (plan de désinscription, C2 et règle 24) : tout part
 * APRÈS la validation, par le canal du bloc `mail`.
 */
describe("UpdateMyProfileHandler — le registre marketing", () => {
  it("un changement d'adresse fait suivre l'état, seulement après la validation", async () => {
    const { handler, marketing, afterCommit } = doubles();

    await handler.execute(command({ email: "camille@nouvelle.fr" }));
    expect(marketing.calls).toEqual([]);
    await afterCommit.commit();

    expect(marketing.calls).toEqual([
      { kind: "move", space: null, from: "camille@ancienne.fr", to: "camille@nouvelle.fr" },
    ]);
  });

  it("la case de l'inscription cochée, adresse prouvée : l'accord sans attente", async () => {
    const { handler, marketing, afterCommit } = doubles();

    await handler.execute(
      command({ signupConsent: { answer: SIGNUP_ANSWER, addressProven: true } }),
    );
    await afterCommit.commit();

    expect(marketing.calls).toEqual([
      {
        kind: "request",
        space: "lfc",
        address: "camille@ancienne.fr",
        consent: {
          textVersion: "society.v1",
          locale: "fr",
          where: "signup",
          ref: "user_1",
          verified: true,
        },
      },
    ]);
  });

  it("la case cochée sur une adresse qui vient de changer : déménagement d'abord, et non prouvée", async () => {
    const { handler, marketing, afterCommit } = doubles();

    await handler.execute(
      command({
        email: "camille@nouvelle.fr",
        signupConsent: { answer: SIGNUP_ANSWER, addressProven: true },
      }),
    );
    await afterCommit.commit();

    expect(marketing.calls.map((call) => call.kind)).toEqual(["move", "request"]);
    expect(marketing.calls[1]).toMatchObject({
      address: "camille@nouvelle.fr",
      consent: { verified: false },
    });
  });

  it("une case non cochée, ou absente, n'écrit rien", async () => {
    const { handler, marketing, afterCommit } = doubles();

    await handler.execute(
      command({
        signupConsent: { answer: { ...SIGNUP_ANSWER, accepted: false }, addressProven: true },
      }),
    );
    await handler.execute(command());
    await afterCommit.commit();

    expect(marketing.calls).toEqual([]);
  });

  it("une propagation qui échoue n'inscrit rien pour après", async () => {
    const { handler, marketing, afterCommit } = doubles({ identityFails: true });

    await expect(handler.execute(command({ email: "camille@nouvelle.fr" }))).rejects.toThrow(
      /indisponible/u,
    );
    await afterCommit.commit();

    expect(marketing.calls).toEqual([]);
  });
});
