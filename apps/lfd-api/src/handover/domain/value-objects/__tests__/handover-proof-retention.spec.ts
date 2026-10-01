import { HandoverProofRetentionInvalidError } from "../../errors/handover-proof-errors.js";
import { HandoverProofRetention } from "../handover-proof-retention.js";

const DAY = 86_400_000;
// Un instant recopié, jamais comparé à l'horloge.
const NOW = new Date(100 * DAY);

describe("HandoverProofRetention", () => {
  it("place la coupure à N jours avant maintenant", () => {
    expect(HandoverProofRetention.ofDays(90).cutoffFrom(NOW)).toEqual(new Date(10 * DAY));
  });

  it.each([0, -3, 1.5, Number.NaN])(
    "refuse %p jour(s) : une purge n'efface pas le présent",
    (days) => {
      expect(() => HandoverProofRetention.ofDays(days)).toThrow(HandoverProofRetentionInvalidError);
    },
  );
});
