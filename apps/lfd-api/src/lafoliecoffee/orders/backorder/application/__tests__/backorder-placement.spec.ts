import { Backorder } from "../../domain/entities/backorder.js";
import {
  BackorderClosedError,
  BackorderNotFoundError,
  BackorderOriginLineMissingError,
  BackorderOriginNotFoundError,
  ParticularBackorderNotConvertibleError,
} from "../../domain/errors/backorder-errors.js";
import { BackorderLine } from "../../domain/value-objects/backorder-line.js";
import {
  backorderEntryOf,
  backorderPolicyOf,
  backorderPricingOf,
  loadBackorder,
} from "../backorder-placement.js";
import {
  BACKORDER,
  FixedBackorderReplays,
  InMemoryBackorders,
  openBackorder,
  ORIGIN_ORDER,
  originLine,
  originReplay,
} from "./backorder-conversion-doubles.js";

/**
 * **Le socle que la transformation et son estimation partagent** : relire
 * sans juger, juger sous le prix d'origine, garnir la saisie. Les refus
 * nomment le cas ; aucun ne passe par un repli.
 */

describe("loadBackorder — relire sans juger l'état", () => {
  it("rend un reliquat transformé : un double clic doit retrouver sa commande, pas un refus", async () => {
    const closed = openBackorder();
    closed.convert("order_x", new Date("2026-08-11T16:00:00.000Z"), "staff_1");

    const loaded = await loadBackorder(new InMemoryBackorders([closed]), BACKORDER);

    expect(loaded.backorder.id).toBe(BACKORDER);
    expect(loaded.companyId).toBe("co_bistrot");
  });

  it("un reliquat inconnu : 404 nommé", async () => {
    await expect(loadBackorder(new InMemoryBackorders([]), "bo_absent")).rejects.toBeInstanceOf(
      BackorderNotFoundError,
    );
  });

  it("un reliquat de particulier : refusé avant tout", async () => {
    const backorders = new InMemoryBackorders([openBackorder({ companyId: null })]);

    await expect(loadBackorder(backorders, BACKORDER)).rejects.toBeInstanceOf(
      ParticularBackorderNotConvertibleError,
    );
  });
});

describe("backorderPricingOf — le prix de l'origine, sur un reliquat ouvert seulement", () => {
  it("un reliquat transformé ou abandonné est refusé SANS relire l'origine", async () => {
    const converted = openBackorder();
    converted.convert("order_x", new Date("2026-08-11T16:00:00.000Z"), "staff_1");
    const abandoned = openBackorder();
    abandoned.abandon(new Date("2026-08-11T16:00:00.000Z"), "staff_1");

    for (const closed of [converted, abandoned]) {
      const replays = new FixedBackorderReplays(originReplay());
      await expect(backorderPricingOf(replays, closed)).rejects.toBeInstanceOf(
        BackorderClosedError,
      );
      expect(replays.asked).toEqual([]);
    }
  });

  it("une origine introuvable : erreur nommée, sans repli sur le prix du catalogue", async () => {
    const replays = new FixedBackorderReplays(null);

    await expect(backorderPricingOf(replays, openBackorder())).rejects.toBeInstanceOf(
      BackorderOriginNotFoundError,
    );
    expect(replays.asked).toEqual([ORIGIN_ORDER]);
  });

  it("un article du reliquat absent de l'origine : erreur nommée, pas un prix inventé", async () => {
    const replays = new FixedBackorderReplays(
      originReplay({ lines: [originLine({ sku: "AUTRE-001" })] }),
    );

    await expect(backorderPricingOf(replays, openBackorder())).rejects.toBeInstanceOf(
      BackorderOriginLineMissingError,
    );
  });

  it("une seule ligne manquante suffit : l'origine qui n'en porte qu'une des deux refuse tout", async () => {
    const two = Backorder.open({
      id: BACKORDER,
      originOrderId: ORIGIN_ORDER,
      companyId: "co_bistrot",
      buyerUserId: "usr_chef",
      lines: [
        BackorderLine.of({ sku: "PAI-001", quantity: 2, saleUnit: "piece" }),
        BackorderLine.of({ sku: "VIE-001", quantity: 1, saleUnit: "piece" }),
      ],
      openedAt: new Date("2026-08-10T10:00:00.000Z"),
    });

    await expect(
      backorderPricingOf(new FixedBackorderReplays(originReplay()), two),
    ).rejects.toBeInstanceOf(BackorderOriginLineMissingError);
  });

  it("le prix rejoué est celui de l'origine, ramené à la quantité du reliquat", async () => {
    const { policy } = await backorderPricingOf(
      new FixedBackorderReplays(originReplay({ lines: [originLine({ quantity: 10 })] })),
      openBackorder({ quantity: 4 }),
    );

    expect(policy.replayed?.lines).toHaveLength(1);
    expect(policy.replayed?.lines[0]).toMatchObject({
      sku: "PAI-001",
      unitPriceMillicents: 300_000,
      quantity: 4,
    });
  });
});

describe("backorderPolicyOf — la dérogation se dépense, la surtaxe non, le port est offert", () => {
  it("pose exactement le couple que le plan décide (décisions 7, 8 et 10)", () => {
    const policy = backorderPolicyOf({ lines: [], discounts: [] });

    expect(policy).toMatchObject({
      deadlineWaiver: "consider",
      lateFee: "waive",
      offeredDelivery: true,
      windowRequester: null,
    });
  });
});

describe("backorderEntryOf — la saisie est garnie par le reliquat, jamais par le corps", () => {
  it("la société et les lignes du reliquat écrasent celles que le corps prétendrait porter", () => {
    const body = {
      companyId: "co_voisin",
      lines: [{ sku: "ROB-999", quantity: 500, saleUnit: "piece" as const }],
      note: "gardée",
    };

    const entry = backorderEntryOf(openBackorder({ quantity: 4 }), "co_bistrot", body);

    expect(entry.companyId).toBe("co_bistrot");
    expect(entry.lines).toEqual([{ sku: "PAI-001", quantity: 4, saleUnit: "piece" }]);
    expect(entry.note).toBe("gardée");
  });

  it("l'unité de vente du reliquat est conservée (un grammage n'est pas une pièce)", () => {
    const byWeight = Backorder.open({
      id: BACKORDER,
      originOrderId: ORIGIN_ORDER,
      companyId: "co_bistrot",
      buyerUserId: "usr_chef",
      lines: [BackorderLine.of({ sku: "FRO-001", quantity: 1_500, saleUnit: "weight" })],
      openedAt: new Date("2026-08-10T10:00:00.000Z"),
    });

    const entry = backorderEntryOf(byWeight, "co_bistrot", {});

    expect(entry.lines).toEqual([{ sku: "FRO-001", quantity: 1_500, saleUnit: "weight" }]);
  });
});
