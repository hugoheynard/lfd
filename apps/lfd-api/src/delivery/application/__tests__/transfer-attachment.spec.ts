import { RecordingPublisher } from "../../../platform/events/__tests__/recording-publisher.js";
import { attachmentOver, InMemoryInternalTransfers, plannedTransfer } from "./transfer-doubles.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);
const VV = { siteId: "site_vv", siteLabel: "Val Village", day: DAY } as const;

describe("TransferAttachment — chaque retrait d'un site servi par transfert a un transfert", () => {
  it("ouvre le transfert prévu du site et du jour, et le dit au journal", async () => {
    const transfers = new InMemoryInternalTransfers();
    const events = new RecordingPublisher();

    const attached = await attachmentOver(
      [
        { orderId: "o_1", ...VV },
        { orderId: "o_2", ...VV },
      ],
      transfers,
      events,
    ).attachAmong(["o_1", "o_2", "o_livraison"]);

    expect(attached).toBe(2);
    expect(transfers.all().map((t) => [t.siteLabel, t.orderIds])).toEqual([
      ["Val Village", ["o_1", "o_2"]],
    ]);
    expect(events.factTypes()).toEqual(["internal_transfer.opened"]);
  });

  it("rejoint le transfert prévu qui existe déjà", async () => {
    const transfers = new InMemoryInternalTransfers(plannedTransfer("t_1", DAY, AT, ["o_1"]));

    await attachmentOver([{ orderId: "o_2", ...VV }], transfers).attachAmong(["o_2"]);

    expect(transfers.all().map((t) => [t.id, t.orderIds])).toEqual([["t_1", ["o_1", "o_2"]]]);
  });

  it("en ouvre un AUTRE quand celui du jour est parti (Q-T3)", async () => {
    const gone = plannedTransfer("t_1", DAY, AT, ["o_1"]);
    gone.depart(AT, () => []);
    const transfers = new InMemoryInternalTransfers(gone);

    await attachmentOver([{ orderId: "o_late", ...VV }], transfers).attachAmong(["o_late"]);

    expect(transfers.all().map((t) => t.orderIds)).toEqual([["o_1"], ["o_late"]]);
  });

  it("est idempotent : une commande déjà rangée n'est pas reprise", async () => {
    const transfers = new InMemoryInternalTransfers(plannedTransfer("t_1", DAY, AT, ["o_1"]));
    const events = new RecordingPublisher();

    const attached = await attachmentOver(
      [{ orderId: "o_1", ...VV }],
      transfers,
      events,
    ).attachAmong(["o_1"]);

    expect(attached).toBe(0);
    expect(transfers.saves).toEqual([]);
    expect(events.traced).toEqual([]);
  });
});
