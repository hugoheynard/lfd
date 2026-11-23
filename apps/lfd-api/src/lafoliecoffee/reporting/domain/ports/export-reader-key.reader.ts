import type { ExportReaderKeyView } from "@lfd/contracts";

/** Port de lecture de l'écran : les clés, sans secret ni haché, les plus récentes d'abord. */
export abstract class ExportReaderKeyReader {
  abstract list(): Promise<ExportReaderKeyView[]>;
}
