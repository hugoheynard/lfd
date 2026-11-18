import type { IdGenerator } from "../../../platform/id/id-generator.js";
import type { JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { PackingSheet, SheetMark } from "../../domain/entities/packing-sheet.js";
import type { PackingStock } from "../../domain/entities/packing-stock.js";
import {
  citeContainer,
  PackingContainerMovedEvent,
  PackingContainerOpenedEvent,
} from "../../domain/events/packing-container.events.js";
import type { PresentLine } from "../../domain/services/problem-lines.js";
import { citedOrderOf } from "../containers/container-support.js";

/**
 * **Le sac d'une commande ajusté à ce que « Problème » dit présent** (plan
 * des niveaux de suivi du colisage, D5 et D6) — une ligne à la fois, sous le
 * verrou de sa réserve, dans l'unité de travail du geste.
 *
 * Le sac porte exactement ce qui est là, borné par la réserve (on ne met
 * jamais au sac une pièce que le four n'a pas remise). Puis l'absent est mis
 * de côté : ce que la réserve tenait pour cette ligne — sorti du sac, ou
 * encore libre — et que personne n'a sous la main. Sans quoi le « Tout est
 * prêt » d'une autre commande le prendrait.
 *
 * Sert aussi « Tout est prêt » (D4), qui remplit chaque ligne entière.
 *
 * Jamais un bac : un retrait se colise en sacs, et rien ne passe par la
 * livraison. Les mouvements sont rendus pour le journal, comme ceux du poste.
 */
export class ProblemBag {
  private readonly traced: JournaledEvent[] = [];

  constructor(
    private readonly sheet: PackingSheet,
    private readonly ids: IdGenerator,
    private readonly mark: SheetMark,
  ) {}

  /** Les faits du journal, dans l'ordre des mouvements. */
  get events(): readonly JournaledEvent[] {
    return this.traced;
  }

  /**
   * **« Tout est prêt »** (D4) : la ligne entière au sac. L'appelant a vérifié
   * sous le même verrou que le libre couvre le reste (`allReadyShortages`) :
   * rien n'est alors mis de côté.
   */
  fill(line: PresentLine["line"], stock: PackingStock): void {
    this.adjust({ line, present: line.quantity }, stock);
  }

  /** Ajuste le sac pour cette ligne, puis met l'absent de côté. */
  adjust({ line, present }: PresentLine, stock: PackingStock): void {
    const inBag = this.heldOf(line.sku);
    const kept = Math.min(present, inBag + stock.free);
    if (kept < inBag) {
      stock.release(this.empty(line, inBag - kept), line.saleUnit);
    }
    if (kept > inBag) {
      const bagId = this.bag();
      const pieces = this.sheet.allocate(bagId, line.sku, kept - inBag, this.mark);
      stock.take(pieces, line.productName, line.saleUnit);
      this.moved("filled", bagId, line, pieces);
    }
    const absent = Math.min(line.quantity - kept, stock.free);
    if (absent > 0) {
      stock.setAside(absent, line.productName, line.saleUnit);
    }
  }

  /** Ressort `quantity` de l'article des contenants vivants. @returns ce qui est sorti. */
  private empty(line: PresentLine["line"], quantity: number): number {
    let left = quantity;
    for (const container of this.liveContainers()) {
      const held = container.lines.find((entry) => entry.sku === line.sku)?.quantity ?? 0;
      const pieces = Math.min(held, left);
      if (pieces > 0) {
        this.sheet.withdraw(container.id, line.sku, pieces);
        this.moved("emptied", container.id, line, pieces);
        left -= pieces;
      }
    }
    return quantity - left;
  }

  /** Le sac vivant de la commande, ouvert ici s'il n'y en a pas. */
  private bag(): string {
    const live = this.liveContainers().find((container) => container.nature === "bag");
    if (live !== undefined) {
      return live.id;
    }
    const id = this.ids.next();
    this.sheet.openContainer({
      id,
      nature: "bag",
      bin: null,
      opened: this.mark,
      voided: null,
      lines: [],
    });
    this.traced.push(
      new PackingContainerOpenedEvent(
        citedOrderOf(this.sheet),
        citeContainer(this.sheet.containerList, id),
        "bag",
      ),
    );
    return id;
  }

  /** Ce que les contenants vivants portent déjà de l'article. */
  heldOf(sku: string): number {
    return this.liveContainers().reduce(
      (sum, container) => sum + (container.lines.find((entry) => entry.sku === sku)?.quantity ?? 0),
      0,
    );
  }

  private liveContainers(): PackingSheet["containerList"] {
    return this.sheet.containerList.filter((container) => container.voided === null);
  }

  private moved(
    direction: "filled" | "emptied",
    containerId: string,
    line: PresentLine["line"],
    pieces: number,
  ): void {
    this.traced.push(
      new PackingContainerMovedEvent(
        direction,
        citedOrderOf(this.sheet),
        citeContainer(this.sheet.containerList, containerId),
        line,
        pieces,
      ),
    );
  }
}
