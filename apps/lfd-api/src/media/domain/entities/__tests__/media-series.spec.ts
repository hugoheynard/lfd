import { isCalendarDay, MediaSeries } from "../media-series.js";
import {
  InvalidMediaSeriesShotOnError,
  InvalidMediaSeriesTitleError,
  MediaSeriesNoteTooLongError,
} from "../../errors/media-series-errors.js";

/**
 * « Aujourd'hui » est un PARAMÈTRE de l'agrégat, jamais l'horloge : les jours
 * ci-dessous ne sont comparés qu'entre eux.
 */
const TODAY = "2026-06-15";

const describing = (
  over: Partial<{ title: string; shotOn: string | null; note: string | null }>,
) => ({
  title: "Atelier du printemps",
  shotOn: null,
  note: null,
  ...over,
});

describe("MediaSeries", () => {
  it("s'ouvre avec un titre rogné, et une note vide devient null", () => {
    const series = MediaSeries.declare(
      "s1",
      describing({ title: "  Été  ", shotOn: "2026-06-01", note: "   " }),
      TODAY,
    );

    expect(series.snapshot()).toEqual({ id: "s1", title: "Été", shotOn: "2026-06-01", note: null });
  });

  it.each(["", "   ", "x".repeat(121)])("refuse le titre %j", (title) => {
    expect(() => MediaSeries.declare("s1", describing({ title }), TODAY)).toThrow(
      InvalidMediaSeriesTitleError,
    );
  });

  it("accepte un titre de 120 caractères et une note de 2000", () => {
    const series = MediaSeries.declare(
      "s1",
      describing({ title: "t".repeat(120), note: "n".repeat(2000) }),
      TODAY,
    );
    expect(series.snapshot().title).toHaveLength(120);
  });

  it("refuse une note de plus de 2000 caractères", () => {
    expect(() => MediaSeries.declare("s1", describing({ note: "n".repeat(2001) }), TODAY)).toThrow(
      MediaSeriesNoteTooLongError,
    );
  });

  it.each(["2026-02-30", "2026-13-01", "15/06/2026", "2026-06-15T10:00", "2025-02-29"])(
    "refuse le jour illisible ou inexistant %j",
    (shotOn) => {
      expect(() => MediaSeries.declare("s1", describing({ shotOn }), TODAY)).toThrow(
        InvalidMediaSeriesShotOnError,
      );
    },
  );

  it("accepte aujourd'hui, et refuse demain", () => {
    expect(MediaSeries.declare("s1", describing({ shotOn: TODAY }), TODAY).snapshot().shotOn).toBe(
      TODAY,
    );
    expect(() => MediaSeries.declare("s1", describing({ shotOn: "2026-06-16" }), TODAY)).toThrow(
      InvalidMediaSeriesShotOnError,
    );
  });

  it("se corrige par describe, avec les mêmes règles", () => {
    const series = MediaSeries.declare("s1", describing({}), TODAY);

    series.describe(
      describing({ title: "Hiver", shotOn: "2026-01-10", note: "four à bois" }),
      TODAY,
    );

    expect(series.snapshot()).toEqual({
      id: "s1",
      title: "Hiver",
      shotOn: "2026-01-10",
      note: "four à bois",
    });
    expect(() => series.describe(describing({ title: " " }), TODAY)).toThrow(
      InvalidMediaSeriesTitleError,
    );
    // Un refus ne laisse rien à moitié écrit.
    expect(series.snapshot().title).toBe("Hiver");
  });

  it("se relit sans comparer sa date à aujourd'hui", () => {
    const series = MediaSeries.rehydrate({
      id: "s1",
      title: "Été",
      shotOn: "2026-06-01",
      note: "",
    });
    expect(series.snapshot()).toEqual({ id: "s1", title: "Été", shotOn: "2026-06-01", note: null });
  });
});

describe("isCalendarDay", () => {
  it("connaît les années bissextiles", () => {
    expect(isCalendarDay("2024-02-29")).toBe(true);
    expect(isCalendarDay("2000-02-29")).toBe(true);
    expect(isCalendarDay("1900-02-29")).toBe(false);
    expect(isCalendarDay("2026-04-31")).toBe(false);
  });
});
