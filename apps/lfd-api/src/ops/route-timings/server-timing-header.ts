import type { ServerTimingMark } from "@lfd/ops-contract";

/**
 * Analyse un en-tête `Server-Timing` (`app;dur=12.3, worker;dur=4;desc="hit"`).
 *
 * Défensive et sans exception : un en-tête absent ou malformé rend les marques
 * qu'on a pu lire, jamais une erreur — c'est un diagnostic, pas un contrat.
 */
export function parseServerTiming(header: string | null): readonly ServerTimingMark[] {
  if (header === null) {
    return [];
  }
  return splitOutsideQuotes(header, ",").flatMap((entry) => {
    const mark = parseMark(entry);
    return mark === null ? [] : [mark];
  });
}

function parseMark(entry: string): ServerTimingMark | null {
  const [rawName, ...params] = splitOutsideQuotes(entry, ";");
  const name = rawName?.trim() ?? "";
  if (!TOKEN.test(name)) {
    return null;
  }
  let durationMs: number | null = null;
  let description: string | null = null;
  for (const param of params) {
    const separator = param.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = param.slice(0, separator).trim().toLowerCase();
    const value = unquote(param.slice(separator + 1).trim());
    if (key === "dur" && durationMs === null) {
      const parsed = Number(value);
      durationMs = value !== "" && Number.isFinite(parsed) ? parsed : null;
    } else if (key === "desc" && description === null) {
      description = value;
    }
  }
  return { name, durationMs, description };
}

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(.)/gu, "$1");
  }
  return value;
}

/** Coupe sur `separator` hors des chaînes entre guillemets. */
function splitOutsideQuotes(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      escaped = false;
    } else if (quoted && char === "\\") {
      escaped = true;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === separator) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}
