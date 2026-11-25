import {
  EventFunctionSheetsReader,
  type EventFunctionSheets,
} from "../event-function-sheets.reader.js";
import {
  type InForceFunctionSheet,
  InForceFunctionSheetsReader,
} from "../in-force-function-sheets.reader.js";

/** Les fiches de fonction d'un jour, posées par le test ; aucune par défaut. */
export class FixedEventFunctionSheets extends EventFunctionSheetsReader {
  readonly asked: string[] = [];

  constructor(private readonly events: readonly EventFunctionSheets[] = []) {
    super();
  }

  sheetsFor(serviceDay: string): Promise<readonly EventFunctionSheets[]> {
    this.asked.push(serviceDay);
    return Promise.resolve(this.events);
  }
}

/** Des événements en panne : la lecture lève. */
export class BrokenEventFunctionSheets extends EventFunctionSheetsReader {
  sheetsFor(): Promise<readonly EventFunctionSheets[]> {
    return Promise.reject(new TypeError("stockage injoignable"));
  }
}

/** Les fiches en vigueur d'un jour, posées par le test ; aucune par défaut. */
export class FixedInForceFunctionSheets extends InForceFunctionSheetsReader {
  constructor(private readonly sheets: readonly InForceFunctionSheet[] = []) {
    super();
  }

  inForceOn(): Promise<readonly InForceFunctionSheet[]> {
    return Promise.resolve(this.sheets);
  }
}
