import type { StaffOverride, StaffUserPayload } from "@lfd/contracts";
import { Logger } from "@nestjs/common";

import { RecordingJournal } from "../../../../platform/journal/__tests__/recording-journal.js";
import { StaffIdentityPort } from "../../../invitations/staff-identity.port.js";
import { STAFF_FACTS } from "../../domain/staff-facts.js";
import type { StaffUserIdentity, StaffUserSnapshot } from "../../domain/staff-user-state.js";
import { UpdateStaffUserCommand } from "../staff-user.commands.js";
import { UpdateStaffUserHandler } from "../update-staff-user.handler.js";
import {
  CECILE,
  RecordingAccessCache,
  ScriptedStaffUsers,
  TrackingUnitOfWork,
} from "./staff-doubles.js";

/** Le fournisseur d'identité : on note les propagations, ou il tombe. */
class RecordingIdentities extends StaffIdentityPort {
  readonly propagated: { subject: string; email: string }[] = [];

  constructor(private readonly fails: boolean) {
    super();
  }

  provision(): Promise<{ subject: string; passwordSetupUrl: string }> {
    return Promise.reject(new Error("non attendu"));
  }

  issuePasswordLink(): Promise<string> {
    return Promise.reject(new Error("non attendu"));
  }

  changeEmail(subject: string, email: string): Promise<void> {
    if (this.fails) {
      return Promise.reject(new Error("fournisseur indisponible"));
    }
    this.propagated.push({ subject, email });
    return Promise.resolve();
  }
}

const PAYLOAD: StaffUserPayload = {
  firstName: "Cécile",
  lastName: "Martin",
  email: "cecile@lfc.test",
  phone: "",
  jobTitle: "",
  role: "commercial",
  overrides: [],
};

const IDENTITY: StaffUserIdentity = {
  firstName: CECILE.firstName,
  lastName: CECILE.lastName,
  email: CECILE.email,
  phone: CECILE.phone,
  jobTitle: CECILE.jobTitle,
  role: CECILE.role,
};

interface Harness {
  readonly handler: UpdateStaffUserHandler;
  readonly staff: ScriptedStaffUsers;
  readonly journal: RecordingJournal;
  readonly identities: RecordingIdentities;
  readonly cache: RecordingAccessCache;
}

function harness(
  options: {
    before?: StaffUserSnapshot;
    after?: Partial<StaffUserIdentity>;
    added?: readonly StaffOverride[];
    identityFails?: boolean;
    journalDown?: boolean;
  } = {},
): Harness {
  const uow = new TrackingUnitOfWork();
  const before = options.before ?? CECILE;
  const staff = new ScriptedStaffUsers(uow, before);
  staff.edit = {
    before,
    after: { ...IDENTITY, ...options.after },
    overrides: { added: options.added ?? [], removed: [], changed: [] },
    roleLabels: { before: "Commercial", after: "Commercial" },
  };
  const journal = new RecordingJournal(options.journalDown ? new Error("journal en panne") : null);
  const identities = new RecordingIdentities(options.identityFails ?? false);
  const cache = new RecordingAccessCache(uow);
  const handler = new UpdateStaffUserHandler(staff, identities, journal, uow, cache);
  return { handler, staff, journal, identities, cache };
}

const run = (h: Harness): Promise<void> =>
  h.handler.execute(new UpdateStaffUserCommand("s1", PAYLOAD, "staff_moi"));

describe("UpdateStaffUserHandler — un fait par changement réel", () => {
  it("n'écrit AUCUN fait pour une édition vide", async () => {
    const h = harness();

    await run(h);

    expect(h.journal.facts).toEqual([]);
  });

  it("écrit trois faits quand identité, rôle et dérogations changent", async () => {
    const h = harness({
      after: { jobTitle: "Vendeuse", role: "comptabilite" },
      added: [{ resource: "b2b_pricing", action: "write", effect: "allow" }],
    });

    await run(h);

    expect(h.journal.types()).toEqual([
      STAFF_FACTS.identityEdited,
      STAFF_FACTS.roleChanged,
      STAFF_FACTS.overridesChanged,
    ]);
  });

  it("écrit dans la transaction, et oublie le cache APRÈS le commit", async () => {
    // Vidé dedans, une requête concurrente le remplirait avec l'état d'avant.
    const h = harness({ after: { role: "support" } });

    await run(h);

    expect(h.staff.writes).toEqual([{ method: "update", insideTransaction: true }]);
    expect(h.cache.forgotten).toEqual([{ insideTransaction: false }]);
  });

  it("ne propage rien et n'oublie rien quand le journal tombe", async () => {
    const h = harness({ after: { email: "c.martin@lfc.test" }, journalDown: true });

    await expect(run(h)).rejects.toThrow("journal en panne");
    expect(h.identities.propagated).toEqual([]);
    expect(h.cache.forgotten).toEqual([]);
  });
});

describe("UpdateStaffUserHandler — l'adresse de connexion suit l'annuaire", () => {
  it("propage une adresse changée sur une identité déjà liée", async () => {
    // Sans ça, la personne se connecterait avec son ancienne adresse pendant
    // que l'écran en afficherait une autre.
    const h = harness({ after: { email: "c.martin@lfc.test" } });

    await run(h);

    expect(h.identities.propagated).toEqual([
      { subject: "auth0|cecile", email: "c.martin@lfc.test" },
    ]);
  });

  it("ne propage rien quand l'adresse n'a pas bougé", async () => {
    // Un appel inutile au fournisseur n'est pas neutre : il repasse l'adresse
    // en « non vérifiée » et déclenche un e-mail de vérification.
    const h = harness({ after: { phone: "0600000000" } });

    await run(h);

    expect(h.identities.propagated).toEqual([]);
  });

  it("ne propage rien pour une fiche jamais liée", async () => {
    // Rien à réparer : l'adresse servira au premier rapprochement, et
    // l'invitation ouvrira l'identité avec la bonne.
    const h = harness({
      before: { ...CECILE, auth0Id: null, status: "pending" },
      after: { email: "autre@lfc.test" },
    });

    await run(h);

    expect(h.identities.propagated).toEqual([]);
  });

  it("remonte l'échec de propagation plutôt que de l'avaler — l'écriture, elle, est faite", async () => {
    // Le désaccord résiduel est tracé et l'appelant le voit : silencieux, il se
    // découvrirait des mois plus tard, le jour où quelqu'un ne peut plus entrer.
    const h = harness({ after: { email: "c.martin@lfc.test" }, identityFails: true });

    await expect(run(h)).rejects.toThrow("fournisseur indisponible");
    expect(h.journal.types()).toEqual([STAFF_FACTS.identityEdited]);
  });

  /**
   * Régression : l'échec de propagation écrivait le `sub` Auth0 de la fiche dans
   * le log de production (« Adresse désynchronisée pour auth0|… ») — un
   * identifiant chez un tiers dans nos logs (fix 2026-09-18).
   */
  it("désigne la fiche par son id dans le log d'échec, jamais par son `sub`", async () => {
    // Le dépôt tourne en ESM, sans `jest` global : on remplace la méthode du
    // Logger à la main, et on la rend quoi qu'il arrive.
    const logged: string[] = [];
    const original = Object.getOwnPropertyDescriptor(Logger.prototype, "error");
    Object.defineProperty(Logger.prototype, "error", {
      configurable: true,
      writable: true,
      value: (message: unknown): void => {
        logged.push(String(message));
      },
    });
    try {
      const h = harness({ after: { email: "c.martin@lfc.test" }, identityFails: true });
      await expect(run(h)).rejects.toThrow("fournisseur indisponible");
    } finally {
      if (original !== undefined) {
        Object.defineProperty(Logger.prototype, "error", original);
      }
    }

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(CECILE.id);
    expect(CECILE.auth0Id).not.toBeNull();
    expect(logged[0]).not.toContain(CECILE.auth0Id ?? "");
  });
});
