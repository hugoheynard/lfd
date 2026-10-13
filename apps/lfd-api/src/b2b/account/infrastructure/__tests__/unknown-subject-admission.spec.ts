import { Test } from "@nestjs/testing";

import type { VerifiedToken } from "../../../../platform/auth/principal.js";
import { UserStatus } from "../../../../platform/database/client/client.js";
import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { AccountExistsUnderAnotherSignInError } from "../../domain/errors/account-errors.js";
import type { GuestClaimOutcome } from "../guest-account-claim.js";
import { GuestAccountClaim } from "../guest-account-claim.js";
import { MembershipAcceptance } from "../membership-acceptance.js";
import { UnknownSubjectAdmission } from "../unknown-subject-admission.js";

const ADDRESS = "lea@invitee.fr";
const BY_CODE: VerifiedToken = {
  subject: "email|lea",
  scopes: [],
  email: ADDRESS,
  emailVerified: true,
};

/** La fiche invité, devenue compte par une AUTRE requête (Google). */
const CLAIMED_BY_OTHER = {
  id: "u_lea",
  email: ADDRESS,
  auth0Sub: "google-oauth2|lea",
  status: UserStatus.active,
  firstName: "Léa",
  lastName: "Martin",
};

/** Rend, lecture après lecture, les comptes de l'adresse donnés dans l'ordre. */
function prismaReading(...reads: readonly (readonly (typeof CLAIMED_BY_OTHER)[])[]) {
  let index = 0;
  return {
    user: {
      findMany: () => {
        const rows = reads[Math.min(index, reads.length - 1)] ?? [];
        index += 1;
        return Promise.resolve([...rows]);
      },
    },
  };
}

async function admissionWith(
  prisma: ReturnType<typeof prismaReading>,
  guestOutcome: GuestClaimOutcome,
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      UnknownSubjectAdmission,
      { provide: PrismaService, useValue: prisma },
      { provide: UnitOfWork, useValue: {} },
      { provide: DomainEventPublisher, useValue: new RecordingPublisher() },
      { provide: MembershipAcceptance, useValue: {} },
      { provide: Clock, useValue: new FixedClock(new Date("2026-10-13T10:00:00.000Z")) },
      { provide: GuestAccountClaim, useValue: { claim: () => Promise.resolve(guestOutcome) } },
    ],
  }).compile();
  return moduleRef.get(UnknownSubjectAdmission);
}

describe("UnknownSubjectAdmission — la fiche invité prise pendant la lecture", () => {
  /**
   * Régression : deux premières entrées simultanées (code, Google) lisaient
   * « aucun compte » ; Google prenait la fiche invité, puis le code ne
   * trouvait plus de fiche et ouvrait un SECOND compte sur la même adresse
   * (CI rouge le 2026-10-13, `guest-account-claim` « une seule gagne »).
   */
  it("relit les comptes quand la fiche a disparu, et refuse au lieu d'ouvrir un second compte", async () => {
    const admission = await admissionWith(prismaReading([], [CLAIMED_BY_OTHER]), "none");

    await expect(admission.admit(BY_CODE)).rejects.toBeInstanceOf(
      AccountExistsUnderAnotherSignInError,
    );
  });

  it("aucun compte, ni avant ni après : compte neuf", async () => {
    const admission = await admissionWith(prismaReading([], []), "none");

    await expect(admission.admit(BY_CODE)).resolves.toBe("new");
  });

  it("la fiche prise par CETTE requête : `claimed`, sans relecture des comptes", async () => {
    const admission = await admissionWith(prismaReading([], [CLAIMED_BY_OTHER]), "claimed");

    await expect(admission.admit(BY_CODE)).resolves.toBe("claimed");
  });
});
