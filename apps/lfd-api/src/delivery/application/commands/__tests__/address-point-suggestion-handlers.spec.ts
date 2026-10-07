import { ResourceNotFoundError } from "../../../../platform/shared/errors/app-error.js";
import { AddressSuggestionChangedError } from "../../../domain/errors/address-suggestion-errors.js";
import {
  north,
  parcOrder,
  gesture,
  suggestionScene,
} from "../../__tests__/address-suggestion-doubles.js";
import { currentSuggestions } from "../../address-point-suggestions-support.js";
import { ApplyAddressPointSuggestionCommand } from "../apply-address-point-suggestion.command.js";
import { ApplyAddressPointSuggestionHandler } from "../apply-address-point-suggestion.handler.js";
import { IgnoreAddressPointSuggestionCommand } from "../ignore-address-point-suggestion.command.js";
import { IgnoreAddressPointSuggestionHandler } from "../ignore-address-point-suggestion.handler.js";

/**
 * **« Appliquer » et « Ignorer »** (`gps-y-aller-et-position.md`, §6) :
 * la suggestion vue est revérifiée ; appliquée, le commerce corrige son carnet
 * et la suggestion s'éteint ; ignorée, elle ne revient pas tant que les
 * livraisons concluent au même point.
 */
/** Le refus du carnet, tel que le commerce le lèverait — la livraison ne le connaît pas. */
class AddressGoneError extends ResourceNotFoundError {
  constructor() {
    super("account.address.not_found", "Adresse introuvable.");
  }
}

function scene(rows = [north(118), north(120), north(122)]) {
  const links = rows.map((_, index) => parcOrder(`o${String(index)}`));
  const s = suggestionScene(
    links,
    rows.map((point, index) => gesture(`o${String(index)}`, point)),
  );
  const ports = {
    positions: s.positions,
    addresses: s.carnet,
    ignored: s.ignored,
    geocodes: s.geocodes,
    departure: s.depot.reader,
    candidates: s.depot,
  };
  const apply = new ApplyAddressPointSuggestionHandler(
    s.positions,
    s.carnet,
    s.ignored,
    s.geocodes,
    s.depot.reader,
    s.depot,
    s.corrector,
    s.decisions,
    s.directory,
    s.ids,
    s.clock,
    s.uow,
  );
  const ignore = new IgnoreAddressPointSuggestionHandler(
    s.positions,
    s.carnet,
    s.ignored,
    s.geocodes,
    s.depot.reader,
    s.depot,
    s.decisions,
    s.directory,
    s.ids,
    s.clock,
    s.uow,
  );
  const now = () => currentSuggestions(ports, s.clock.now());
  return { ...s, apply, ignore, now };
}

describe("ApplyAddressPointSuggestionHandler — « Appliquer »", () => {
  it("demande au commerce la porte vue, inscrit la décision, et la suggestion s'éteint", async () => {
    const s = scene();
    const [shown] = await s.now();
    const seen = shown?.suggested ?? north(0);

    await s.apply.execute(new ApplyAddressPointSuggestionCommand("staff_ana", "a1", "door", seen));

    expect(s.corrector.corrections).toEqual([
      { companyId: "c1", addressId: "a1", kind: "door", point: seen },
    ]);
    expect(s.decisions.recorded.map((d) => d.toSnapshot())).toEqual([
      expect.objectContaining({
        addressId: "a1",
        kind: "door",
        outcome: "applied",
        decidedBy: "staff_ana",
        decidedByName: "Ana Martin",
      }),
    ]);
    expect(await s.now()).toEqual([]);
  });

  it("refuse une suggestion qui n'existe pas — rien ne part au commerce", async () => {
    const s = scene([north(118), north(120)]);

    await expect(
      s.apply.execute(
        new ApplyAddressPointSuggestionCommand("staff_ana", "a1", "door", north(120)),
      ),
    ).rejects.toBeInstanceOf(AddressSuggestionChangedError);
    expect(s.corrector.corrections).toEqual([]);
    expect(s.decisions.recorded).toEqual([]);
  });

  it("refuse un point que le bureau n'a pas vu (la suggestion a bougé)", async () => {
    const s = scene();

    await expect(
      s.apply.execute(
        new ApplyAddressPointSuggestionCommand("staff_ana", "a1", "door", north(160)),
      ),
    ).rejects.toBeInstanceOf(AddressSuggestionChangedError);
  });

  it("le refus du commerce remonte tel quel, et la décision n'est pas inscrite", async () => {
    const s = scene();
    const [shown] = await s.now();
    s.corrector.correct = () => Promise.reject(new AddressGoneError());

    await expect(
      s.apply.execute(
        new ApplyAddressPointSuggestionCommand(
          "staff_ana",
          "a1",
          "door",
          shown?.suggested ?? north(0),
        ),
      ),
    ).rejects.toBeInstanceOf(AddressGoneError);
    expect(s.decisions.recorded).toEqual([]);
  });
});

describe("IgnoreAddressPointSuggestionHandler — « Ignorer »", () => {
  it("n'écrit rien au carnet, et la suggestion n'est plus proposée", async () => {
    const s = scene();
    const [shown] = await s.now();

    await s.ignore.execute(
      new IgnoreAddressPointSuggestionCommand(
        "staff_ana",
        "a1",
        "door",
        shown?.suggested ?? north(0),
      ),
    );

    expect(s.corrector.corrections).toEqual([]);
    expect(s.decisions.recorded.map((d) => d.toSnapshot().outcome)).toEqual(["ignored"]);
    expect(await s.now()).toEqual([]);
  });

  it("une livraison de plus au même endroit ne la ramène pas", async () => {
    const s = scene();
    const [shown] = await s.now();
    await s.ignore.execute(
      new IgnoreAddressPointSuggestionCommand(
        "staff_ana",
        "a1",
        "door",
        shown?.suggested ?? north(0),
      ),
    );

    s.carnet.links.push(parcOrder("o9"));
    s.positions.rows.push(gesture("o9", north(121)));

    expect(await s.now()).toEqual([]);
  });

  it("refuse ce qui n'est plus suggéré", async () => {
    const s = scene();

    await expect(
      s.ignore.execute(
        new IgnoreAddressPointSuggestionCommand("staff_ana", "a1", "parking", north(120)),
      ),
    ).rejects.toBeInstanceOf(AddressSuggestionChangedError);
  });
});
