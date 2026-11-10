import { Test } from "@nestjs/testing";

import type { VerifiedToken } from "../../../../platform/auth/principal.js";
import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { GuestAccountClaimedEvent } from "../../domain/events/guest-account-claimed.event.js";
import { GuestAccountClaim } from "../guest-account-claim.js";

const NOW = new Date("2026-08-12T10:00:00.000Z");

/** Une fiche invité telle que la lecture la rend. */
interface GuestRow {
  readonly id: string;
  readonly email: string;
}

/** L'écriture conditionnelle, telle qu'elle part. */
interface ClaimWrite {
  readonly where: { readonly id: string; readonly auth0Sub: null };
  readonly data: {
    readonly auth0Sub: string;
    readonly emailVerified: boolean;
    readonly becameAccountAt: Date;
  };
}

/**
 * Double Prisma : la lecture rend TOUT ce qu'on lui donne (le pré-filtre
 * `ILIKE` est simulé large, c'est à l'adaptateur de trancher l'égalité) ;
 * l'écriture répond le nombre de lignes demandé.
 */
function prismaDouble(guests: readonly GuestRow[], claimCount = 1) {
  const writes: ClaimWrite[] = [];
  let reads = 0;
  return {
    writes,
    reads: () => reads,
    prisma: {
      user: {
        findMany: () => {
          reads += 1;
          return Promise.resolve([...guests]);
        },
        updateMany: (args: ClaimWrite) => {
          writes.push(args);
          return Promise.resolve({ count: claimCount });
        },
      },
    },
  };
}

async function claimWith(double: ReturnType<typeof prismaDouble>, events: RecordingPublisher) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      GuestAccountClaim,
      { provide: PrismaService, useValue: double.prisma },
      { provide: DomainEventPublisher, useValue: events },
      { provide: Clock, useValue: new FixedClock(NOW) },
    ],
  }).compile();
  return moduleRef.get(GuestAccountClaim);
}

const BY_CODE: VerifiedToken = {
  subject: "email|6ac8",
  scopes: [],
  email: "Lea@Exemple.fr ",
  emailVerified: true,
};

const GUEST: GuestRow = { id: "guest_1", email: "lea@exemple.fr" };

describe("GuestAccountClaim — l'invité qui devient le compte (R1)", () => {
  it("pose le `sub`, la preuve et l'instant sur l'unique fiche, sous condition, et le publie", async () => {
    const double = prismaDouble([GUEST]);
    const events = new RecordingPublisher();

    await expect((await claimWith(double, events)).claim(BY_CODE)).resolves.toBe("claimed");

    expect(double.writes).toEqual([
      {
        where: { id: "guest_1", auth0Sub: null },
        data: { auth0Sub: "email|6ac8", emailVerified: true, becameAccountAt: NOW },
      },
    ]);
    expect(events.published).toEqual([new GuestAccountClaimedEvent("guest_1")]);
  });

  it("rend `lost` sans rien publier quand une autre requête a pris la fiche", async () => {
    const double = prismaDouble([GUEST], 0);
    const events = new RecordingPublisher();

    await expect((await claimWith(double, events)).claim(BY_CODE)).resolves.toBe("lost");
    expect(events.published).toEqual([]);
  });

  it.each([
    ["le mot de passe", { subject: "auth0|66a1" }],
    ["Facebook", { subject: "facebook|1234" }],
    ["une adresse non prouvée", { emailVerified: false }],
    ["une adresse vide", { email: "" }],
  ])("ne lit ni n'écrit rien pour %s", async (_case, overrides) => {
    const double = prismaDouble([GUEST]);
    const events = new RecordingPublisher();
    const token: VerifiedToken = { ...BY_CODE, ...overrides };

    await expect((await claimWith(double, events)).claim(token)).resolves.toBe("none");
    expect(double.reads()).toBe(0);
    expect(double.writes).toEqual([]);
  });

  it("ne lit rien quand le jeton ne dit rien de la preuve", async () => {
    const double = prismaDouble([GUEST]);
    const { emailVerified: _absent, ...silent } = BY_CODE;

    await expect((await claimWith(double, new RecordingPublisher())).claim(silent)).resolves.toBe(
      "none",
    );
    expect(double.reads()).toBe(0);
  });

  it("🔴 n'écrit rien quand deux fiches portent l'adresse (R5)", async () => {
    const double = prismaDouble([GUEST, { id: "guest_2", email: "LEA@exemple.fr" }]);

    await expect((await claimWith(double, new RecordingPublisher())).claim(BY_CODE)).resolves.toBe(
      "none",
    );
    expect(double.writes).toEqual([]);
  });

  it("n'écrit rien sans fiche invité", async () => {
    const double = prismaDouble([]);

    await expect((await claimWith(double, new RecordingPublisher())).claim(BY_CODE)).resolves.toBe(
      "none",
    );
    expect(double.writes).toEqual([]);
  });

  it("ne confond pas deux adresses que `ILIKE` rapprocherait", async () => {
    const double = prismaDouble([{ id: "guest_x", email: "leaxexemple@exemple.fr" }]);
    const token: VerifiedToken = { ...BY_CODE, email: "lea_exemple@exemple.fr" };

    await expect((await claimWith(double, new RecordingPublisher())).claim(token)).resolves.toBe(
      "none",
    );
    expect(double.writes).toEqual([]);
  });
});
