import { extractOrCreateTraceId, newTraceId } from "../trace-context.js";

const VALID = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const HEX_32 = /^[0-9a-f]{32}$/;

/**
 * Trace Context W3C : on extrait le traceId d'un `traceparent` conforme, sinon
 * on en génère un — le backend reste toujours corrélable, même sans gateway.
 */
describe("extractOrCreateTraceId", () => {
  it("extrait le traceId d'un traceparent conforme", () => {
    expect(extractOrCreateTraceId(VALID)).toBe(TRACE_ID);
  });

  it("est insensible à la casse", () => {
    expect(extractOrCreateTraceId(VALID.toUpperCase())).toBe(TRACE_ID);
  });

  it("prend la première valeur si l'en-tête est un tableau", () => {
    expect(extractOrCreateTraceId([VALID, "autre"])).toBe(TRACE_ID);
  });

  it("génère un traceId neuf si l'en-tête est absent", () => {
    expect(extractOrCreateTraceId(undefined)).toMatch(HEX_32);
  });

  it("génère un traceId neuf si le traceparent est malformé", () => {
    expect(extractOrCreateTraceId("pas-un-traceparent")).toMatch(HEX_32);
  });

  it("rejette l'ID de trace tout-à-zéro (invalide W3C) et en génère un", () => {
    const header = "00-00000000000000000000000000000000-00f067aa0ba902b7-01";
    const result = extractOrCreateTraceId(header);
    expect(result).not.toBe("00000000000000000000000000000000");
    expect(result).toMatch(HEX_32);
  });
});

describe("newTraceId", () => {
  it("rend 32 caractères hexadécimaux (16 octets)", () => {
    expect(newTraceId()).toMatch(HEX_32);
  });

  it("rend une valeur différente à chaque appel", () => {
    expect(newTraceId()).not.toBe(newTraceId());
  });
});
