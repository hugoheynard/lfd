import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffAuthorDirectory,
  StaffAuthors,
} from "../../../../../staff/directory/domain/staff-author-directory.js";
import {
  ChorusDeposit,
  type ChorusDepositEntry,
  type ChorusInvoiceFacts,
} from "../../../domain/entities/chorus-deposit.js";
import {
  ChorusAlreadyDepositedError,
  ChorusDepositInvoiceNotFoundError,
  InvoiceNotForChorusError,
} from "../../../domain/errors/chorus-deposit-errors.js";
import { ChorusDepositRepository } from "../../../domain/ports/chorus-deposit.repository.js";
import { NoteChorusAcceptanceCommand } from "../note-chorus-acceptance.command.js";
import { NoteChorusAcceptanceHandler } from "../note-chorus-acceptance.handler.js";
import { NoteChorusDepositCommand } from "../note-chorus-deposit.command.js";
import { NoteChorusDepositHandler } from "../note-chorus-deposit.handler.js";
import { NoteChorusRejectionCommand } from "../note-chorus-rejection.command.js";
import { NoteChorusRejectionHandler } from "../note-chorus-rejection.handler.js";

/** Horloge FIXE : le 10 octobre 2026 à 10 h à Paris. Les jours saisis lui sont comparés. */
const NOW = new Date("2026-10-10T08:00:00.000Z");
const STAFF = "s_compta";

const ARMY_INVOICE: ChorusInvoiceFacts = {
  invoiceId: "inv_army",
  number: "FA-LFD-2026-000007",
  payerCompanyId: "c_army",
  payerName: "Base de défense",
  isCreditNote: false,
  buyerLegalForm: "public_state",
  issuedOn: "2026-09-30",
  dueOn: "2026-10-30",
  creditedOut: false,
};

/** Le journal de dépôt en mémoire : `save` n'ajoute que les lignes neuves, comme l'adaptateur. */
class MemoryChorusDeposits extends ChorusDepositRepository {
  readonly saved: { readonly invoiceId: string; readonly kind: string }[] = [];
  private readonly entries = new Map<string, ChorusDepositEntry[]>();

  constructor(private readonly invoices: readonly ChorusInvoiceFacts[]) {
    super();
  }

  load(invoiceId: string): Promise<ChorusDeposit | null> {
    const invoice = this.invoices.find((one) => one.invoiceId === invoiceId);
    return Promise.resolve(
      invoice === undefined ? null : ChorusDeposit.of(invoice, this.entries.get(invoiceId) ?? []),
    );
  }

  save(deposit: ChorusDeposit): Promise<void> {
    const id = deposit.invoice.invoiceId;
    for (const entry of deposit.pending()) {
      this.entries.set(id, [...(this.entries.get(id) ?? []), entry]);
      this.saved.push({ invoiceId: id, kind: entry.kind });
    }
    return Promise.resolve();
  }
}

class Accountant extends StaffAuthorDirectory {
  identify(): Promise<StaffAuthors> {
    return Promise.resolve(
      new StaffAuthors(
        new Map([
          [
            STAFF,
            {
              staffUserId: STAFF,
              firstName: "Camille",
              lastName: "Compta",
              role: "accountant",
              roleLabel: "Comptabilité",
              jobTitle: "",
            },
          ],
        ]),
      ),
    );
  }
}

function harness(invoices: readonly ChorusInvoiceFacts[] = [ARMY_INVOICE]) {
  const deposits = new MemoryChorusDeposits(invoices);
  const events = new RecordingPublisher();
  const deps = [
    deposits,
    new Accountant(),
    new FixedIdGenerator("chorus"),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  ] as const;
  return {
    deposits,
    events,
    deposit: new NoteChorusDepositHandler(...deps),
    reject: new NoteChorusRejectionHandler(...deps),
    accept: new NoteChorusAcceptanceHandler(...deps),
  };
}

describe("les gestes du dépôt Chorus (P3, T5′)", () => {
  it("« Déposée le … » écrit une ligne et le fait invoice.chorus_deposited", async () => {
    const { deposits, events, deposit } = harness();

    await deposit.execute(new NoteChorusDepositCommand("inv_army", "2026-10-05", STAFF));

    expect(deposits.saved).toEqual([{ invoiceId: "inv_army", kind: "deposited" }]);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      expect.objectContaining({
        type: "invoice.chorus_deposited",
        subjectType: "invoice",
        subjectId: "inv_army",
        payload: {
          subjectLabel: "FA-LFD-2026-000007",
          payer: { id: "c_army", name: "Base de défense" },
          occurredOn: "2026-10-05",
        },
      }),
    ]);
  });

  it("rejet avec motif, puis le second dépôt est refusé sans rien écrire", async () => {
    const { deposits, events, deposit, reject } = harness();
    await deposit.execute(new NoteChorusDepositCommand("inv_army", "2026-10-05", STAFF));

    await reject.execute(
      new NoteChorusRejectionCommand("inv_army", "2026-10-07", "Engagement inconnu", STAFF),
    );
    await expect(
      deposit.execute(new NoteChorusDepositCommand("inv_army", "2026-10-08", STAFF)),
    ).rejects.toBeInstanceOf(ChorusAlreadyDepositedError);

    expect(deposits.saved.map((one) => one.kind)).toEqual(["deposited", "rejected"]);
    expect(events.traced.at(-1)?.journalFact()).toMatchObject({
      type: "invoice.chorus_rejected",
      payload: { reason: "Engagement inconnu", occurredOn: "2026-10-07" },
    });
  });

  it("« Mise en paiement » après le dépôt : le fait invoice.chorus_accepted", async () => {
    const { events, deposit, accept } = harness();
    await deposit.execute(new NoteChorusDepositCommand("inv_army", "2026-10-05", STAFF));

    await accept.execute(new NoteChorusAcceptanceCommand("inv_army", "2026-10-09", STAFF));

    expect(events.traced.at(-1)?.journalFact().type).toBe("invoice.chorus_accepted");
  });

  it("une pièce inconnue : 404 ; une facture d'un pro : refus, rien n'est écrit", async () => {
    const { deposits, events, deposit } = harness([
      { ...ARMY_INVOICE, invoiceId: "inv_pro", buyerLegalForm: "SARL" },
    ]);

    await expect(
      deposit.execute(new NoteChorusDepositCommand("absente", "2026-10-05", STAFF)),
    ).rejects.toBeInstanceOf(ChorusDepositInvoiceNotFoundError);
    await expect(
      deposit.execute(new NoteChorusDepositCommand("inv_pro", "2026-10-05", STAFF)),
    ).rejects.toBeInstanceOf(InvoiceNotForChorusError);
    expect(deposits.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });
});
