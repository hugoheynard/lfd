import type { AppConfig } from "../../../../platform/config/app-config.js";
import { RecordingJournal } from "../../../../platform/journal/__tests__/recording-journal.js";
import {
  type DeferrableMailTemplate,
  type DeferredMailDemand,
  type MailRequested,
} from "../../../../mail/channels/requests/mail.js";
import { RecordingMail } from "../../../../mail/channels/requests/__tests__/recording-mail.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { STAFF_FACTS } from "../../domain/staff-facts.js";
import type { StaffUserSnapshot } from "../../domain/staff-user-state.js";
import { SetStaffStatusCommand } from "../set-staff-status.command.js";
import { SetStaffStatusHandler } from "../set-staff-status.handler.js";
import {
  CECILE,
  RecordingAccessCache,
  ScriptedStaffUsers,
  TrackingUnitOfWork,
} from "./staff-doubles.js";

/** La porte du bloc, qui note en plus si chaque demande est arrivée DANS la transaction. */
class InsideMail extends RecordingMail {
  readonly inside: boolean[] = [];

  constructor(private readonly tracking: TrackingUnitOfWork) {
    super();
  }

  override send<K extends DeferrableMailTemplate>(
    demand: DeferredMailDemand<K>,
  ): Promise<MailRequested> {
    this.inside.push(this.tracking.inside);
    return super.send(demand);
  }
}

function harness(before: StaffUserSnapshot, journalDown = false) {
  const uow = new TrackingUnitOfWork();
  const staff = new ScriptedStaffUsers(uow, before);
  const journal = new RecordingJournal(journalDown ? new Error("journal en panne") : null);
  const cache = new RecordingAccessCache(uow);
  const mails = new InsideMail(uow);
  const config = { adminBaseUrl: (): string => "https://admin.test" } as AppConfig;
  const handler = new SetStaffStatusHandler(
    staff,
    config,
    mails,
    journal,
    uow,
    cache,
    inMemoryIntents(),
  );
  return { handler, journal, cache, mails };
}

const FIRST = "0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c";
const SECOND = "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const suspend = new SetStaffStatusCommand("s1", { status: "suspended" }, "staff_moi", FIRST);

describe("SetStaffStatusHandler — la porte se ferme avec sa trace", () => {
  it("suspend : un fait et la demande d'e-mail dans la transaction, le cache oublié APRÈS", async () => {
    const h = harness(CECILE);

    await h.handler.execute(suspend);

    expect(h.journal.facts).toEqual([
      {
        type: STAFF_FACTS.suspended,
        subjectType: "staff_user",
        subjectId: "s1",
        payload: {
          subjectLabel: "Cécile Martin",
          person: { firstName: "Cécile", lastName: "Martin" },
        },
      },
    ]);
    expect(h.cache.forgotten).toEqual([{ insideTransaction: false }]);
    expect(h.mails.queued).toEqual([
      {
        to: CECILE.email,
        template: "staff.access-suspended",
        idempotencyKey: `staff.access-suspended:s1:${FIRST}`,
        data: { firstName: "Cécile" },
        subjects: [{ type: "staff_member", id: "s1" }],
      },
    ]);
    expect(h.mails.inside).toEqual([true]);
    expect(h.mails.awaitedReceipt).toEqual([]);
  });

  it("réintègre une personne suspendue", async () => {
    const h = harness({ ...CECILE, status: "suspended" });

    await h.handler.execute(
      new SetStaffStatusCommand("s1", { status: "active" }, "staff_moi", FIRST),
    );

    expect(h.journal.types()).toEqual([STAFF_FACTS.reinstated]);
    expect(h.mails.queued).toEqual([
      {
        to: CECILE.email,
        template: "staff.access-restored",
        idempotencyKey: `staff.access-restored:s1:${FIRST}`,
        data: { firstName: "Cécile", backOfficeUrl: "https://admin.test" },
        subjects: [{ type: "staff_member", id: "s1" }],
      },
    ]);
  });

  it("active pour la PREMIÈRE fois une fiche en attente : `activated`, pas `reinstated` (D7)", async () => {
    const h = harness({ ...CECILE, status: "pending" });

    await h.handler.execute(
      new SetStaffStatusCommand("s1", { status: "active" }, "staff_moi", FIRST),
    );

    expect(h.journal.types()).toEqual([STAFF_FACTS.activated]);
  });

  it("n'écrit aucun fait quand l'état ne bouge pas", async () => {
    const h = harness({ ...CECILE, status: "suspended" });

    await h.handler.execute(suspend);

    expect(h.journal.facts).toEqual([]);
  });

  it("n'envoie rien et n'oublie rien quand le journal tombe", async () => {
    const h = harness(CECILE, true);

    await expect(h.handler.execute(suspend)).rejects.toThrow("journal en panne");
    expect(h.mails.queued).toEqual([]);
    expect(h.cache.forgotten).toEqual([]);
  });

  it("deux suspensions VOULUES de la même personne ont deux clés : la seconde n'est pas tue", async () => {
    // Le bloc garde une clé un an et ne renvoie pas une clé connue : une clé
    // fixe par personne aurait tu l'e-mail d'une seconde suspension.
    const h = harness(CECILE);

    await h.handler.execute(suspend);
    await h.handler.execute(
      new SetStaffStatusCommand("s1", { status: "suspended" }, "staff_moi", SECOND),
    );

    const keys = h.mails.queued.map((mail) => mail.idempotencyKey);
    expect(new Set(keys).size).toBe(2);
  });

  /**
   * Régression (revue de S2, cas 4) : la clé était tirée au hasard, et un
   * double clic demandait deux e-mails.
   */
  it("un double clic de même intention ne demande qu'un e-mail et ne repasse pas le geste", async () => {
    const h = harness(CECILE);

    await h.handler.execute(suspend);
    await h.handler.execute(suspend);

    expect(h.mails.queued).toHaveLength(1);
    expect(h.journal.facts).toHaveLength(1);
  });

  it("une demande d'e-mail refusée fait échouer le geste, et le cache n'est pas oublié", async () => {
    // La demande est une écriture de la transaction : si elle tombe, la
    // transaction aussi (le vrai Postgres annule ; ce double ne le joue pas).
    const h = harness(CECILE);
    h.mails.failWith = new Error("boîte d'envoi indisponible");

    await expect(h.handler.execute(suspend)).rejects.toThrow("boîte d'envoi indisponible");
    expect(h.cache.forgotten).toEqual([]);
  });
});
