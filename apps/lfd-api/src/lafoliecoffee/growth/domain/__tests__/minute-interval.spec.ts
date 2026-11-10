import { mergeIntervals, subtractIntervals } from "../minute-interval.js";

describe("minute-interval", () => {
  describe("mergeIntervals", () => {
    it("trie et fusionne ce qui se chevauche", () => {
      expect(
        mergeIntervals([
          { start: 600, end: 660 },
          { start: 540, end: 620 },
        ]),
      ).toEqual([{ start: 540, end: 660 }]);
    });

    it("fusionne deux plages qui se touchent bout à bout", () => {
      expect(
        mergeIntervals([
          { start: 540, end: 600 },
          { start: 600, end: 660 },
        ]),
      ).toEqual([{ start: 540, end: 660 }]);
    });

    it("garde séparées deux plages disjointes", () => {
      const intervals = [
        { start: 540, end: 600 },
        { start: 660, end: 720 },
      ];
      expect(mergeIntervals(intervals)).toEqual(intervals);
    });

    it("jette les plages vides ou inversées plutôt que de les propager", () => {
      expect(
        mergeIntervals([
          { start: 600, end: 600 },
          { start: 700, end: 650 },
        ]),
      ).toEqual([]);
    });
  });

  describe("subtractIntervals", () => {
    it("coupe une plage en deux quand le trou est au milieu", () => {
      expect(subtractIntervals([{ start: 540, end: 720 }], [{ start: 600, end: 660 }])).toEqual([
        { start: 540, end: 600 },
        { start: 660, end: 720 },
      ]);
    });

    it("rogne le début, puis la fin", () => {
      expect(subtractIntervals([{ start: 540, end: 720 }], [{ start: 500, end: 600 }])).toEqual([
        { start: 600, end: 720 },
      ]);
      expect(subtractIntervals([{ start: 540, end: 720 }], [{ start: 700, end: 800 }])).toEqual([
        { start: 540, end: 700 },
      ]);
    });

    it("efface une plage entièrement recouverte", () => {
      expect(subtractIntervals([{ start: 540, end: 720 }], [{ start: 500, end: 800 }])).toEqual([]);
    });

    it("ignore un trou qui ne touche rien", () => {
      const base = [{ start: 540, end: 600 }];
      expect(subtractIntervals(base, [{ start: 700, end: 800 }])).toEqual(base);
    });

    it("applique plusieurs trous, y compris chevauchants", () => {
      expect(
        subtractIntervals(
          [{ start: 540, end: 780 }],
          [
            { start: 600, end: 640 },
            { start: 620, end: 660 },
            { start: 700, end: 720 },
          ],
        ),
      ).toEqual([
        { start: 540, end: 600 },
        { start: 660, end: 700 },
        { start: 720, end: 780 },
      ]);
    });
  });
});
