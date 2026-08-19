import type { PricedSku } from "../src/orders/domain/ports/product-catalog.reader.js";

/**
 * ⚠️ **Jeu de données de TEST**, plus une source de production.
 *
 * Il a été l'autorité de prix du checkout jusqu'à la bascule sur le miroir du
 * référentiel. Il vit maintenant dans `test/` parce que c'est ce qu'il est
 * devenu : les suites nomment ses SKU et ses prix, et les réécrire aurait
 * mélangé « la bascule casse quelque chose » avec « le test parle d'autre
 * chose ».
 */
/**
 * Catalogue **semé** du B2B — miroir du seed front (catalogue-seed.ts), lui-même
 * copié du PIM. Source de prix **autoritaire** au checkout : le client n'envoie
 * qu'un sku + une quantité, le serveur résout ici le nom et le prix, jamais
 * l'inverse. Prix en **centimes TTC** ; la TVA est ajoutée par le catalogue
 * (0 en Phase 1, le seed front n'ayant pas de taux numérique).
 *
 * Jetable : remplacé par la vraie synchro catalogue PIM. On ne dérive rien de
 * métier d'ici — juste une table de correspondance sku → (nom, prix).
 */
export const CATALOG_SEED: readonly PricedSku[] = [
  { sku: "VIE-001", name: "Croissant", unitPriceCents: 200 },
  { sku: "VIE-002", name: "Pain au chocolat", unitPriceCents: 220 },
  { sku: "VIE-003", name: "Patte d'ours", unitPriceCents: 300 },
  { sku: "VIE-004", name: "Pain aux raisins", unitPriceCents: 250 },
  { sku: "VIE-005", name: "Chausson aux pommes", unitPriceCents: 300 },
  { sku: "VIE-006", name: "Brioche pralinée individuelle", unitPriceCents: 250 },
  { sku: "VIE-007", name: "Brioche pépites de chocolat", unitPriceCents: 270 },
  { sku: "VIE-008", name: "Brioche au sucre", unitPriceCents: 230 },
  { sku: "VIE-009", name: "Pain au lait", unitPriceCents: 200 },
  { sku: "VIE-010", name: "Brioche a tete", unitPriceCents: 250 },
  { sku: "VIE-011", name: "Grosse brioche 350 g", unitPriceCents: 1000 },
  { sku: "VIE-012", name: "Abricotin", unitPriceCents: 250 },
  { sku: "VIE-013", name: "Pain chocolat-banane", unitPriceCents: 250 },
  { sku: "VIE-014", name: "Pain de mie brioché 500 g cuit", unitPriceCents: 650 },
  { sku: "VIE-015", name: "Croix de Savoie", unitPriceCents: 300 },
  { sku: "VIE-016", name: "Sablé suisse", unitPriceCents: 380 },
  { sku: "VIE-017", name: "Croissant aux amandes", unitPriceCents: 300 },
  { sku: "VIE-018", name: "Pain au chocolat aux amandes", unitPriceCents: 300 },
  { sku: "VIE-019", name: "Gros cookie", unitPriceCents: 400 },
  { sku: "PAI-001", name: "Baguette tradition", unitPriceCents: 200 },
  { sku: "PAI-002", name: "Baguette artisane 200 g", unitPriceCents: 180 },
  { sku: "PAI-003", name: "Baguette village plateau 200 g", unitPriceCents: 200 },
  { sku: "PAI-004", name: "Pain Viking 300 g", unitPriceCents: 400 },
  { sku: "PAI-005", name: "Petit pain Beaufort", unitPriceCents: 210 },
  { sku: "PAI-006", name: "Pain moisson 300 g", unitPriceCents: 400 },
  { sku: "PAI-007", name: "Flûte village 450 g", unitPriceCents: 250 },
  { sku: "PAI-008", name: "Pain de campagne 300 g", unitPriceCents: 400 },
  { sku: "PAI-009", name: "Baguette campagrain 200 g", unitPriceCents: 250 },
  { sku: "PAI-010", name: "Ficelle artisane 140 g", unitPriceCents: 175 },
  { sku: "PAI-011", name: "Flûte artisane 420 g", unitPriceCents: 350 },
  { sku: "PAI-012", name: "Flûte tradition 450 g", unitPriceCents: 350 },
  { sku: "PAI-013", name: "Pain complet 300 g", unitPriceCents: 400 },
  { sku: "PAI-014", name: "Pain de seigle 300 g", unitPriceCents: 400 },
  { sku: "PAI-015", name: "Pain sportif au kg", unitPriceCents: 1600 },
  { sku: "PAI-016", name: "Campaillou au kg", unitPriceCents: 1000 },
  { sku: "PAI-017", name: "Pavé aux noix 300 g", unitPriceCents: 500 },
  { sku: "PAI-018", name: "Pain de mie carré frais 340 g", unitPriceCents: 550 },
  { sku: "PAT-001", name: "Tartelette myrtilles", unitPriceCents: 600 },
  { sku: "PAT-002", name: "Flan nature (part)", unitPriceCents: 400 },
  { sku: "PAT-003", name: "Tartelette framboises", unitPriceCents: 600 },
  { sku: "PAT-004", name: "Délice des neiges", unitPriceCents: 400 },
  { sku: "PAT-005", name: "Éclair chocolat", unitPriceCents: 600 },
  { sku: "PAT-006", name: "Tartelette citron", unitPriceCents: 600 },
  { sku: "PAT-007", name: "Éclair café", unitPriceCents: 600 },
  { sku: "PAT-008", name: "Éclair vanille", unitPriceCents: 600 },
  { sku: "PAT-009", name: "Tarte citron meringuée (part)", unitPriceCents: 600 },
  { sku: "PAT-010", name: "Crumble framboise", unitPriceCents: 750 },
  { sku: "PAT-011", name: "Rose des sables", unitPriceCents: 400 },
  { sku: "PAT-012", name: "Pyramide", unitPriceCents: 500 },
  { sku: "PAT-013", name: "Tartelette noix caramel", unitPriceCents: 600 },
  { sku: "PAT-014", name: "Mousse chocolat", unitPriceCents: 600 },
  { sku: "PAT-015", name: "Tarte myrtille T1 (4 personnes)", unitPriceCents: 3000 },
  { sku: "PAT-016", name: "Mont-Blanc individuel", unitPriceCents: 700 },
  { sku: "PAT-017", name: "Tarte poire fermière (part)", unitPriceCents: 500 },
  { sku: "PAT-018", name: "Tarte abricot fermière (part)", unitPriceCents: 500 },
  { sku: "SAL-001", name: "Sandwich jambon blanc Beaufort", unitPriceCents: 700 },
  { sku: "SAL-002", name: "Tourte au Beaufort (part)", unitPriceCents: 650 },
  { sku: "SAL-003", name: "Quiche lorraine (part)", unitPriceCents: 550 },
  { sku: "SAL-004", name: "Pan bagnat thon", unitPriceCents: 700 },
  { sku: "SAL-005", name: "Pizza (part)", unitPriceCents: 550 },
  { sku: "SAL-006", name: "Club poulet", unitPriceCents: 700 },
  { sku: "SAL-007", name: "Sandwich poulet graines", unitPriceCents: 700 },
  { sku: "SAL-008", name: "Sandwich jambon cru tomme", unitPriceCents: 700 },
  { sku: "SAL-009", name: "Sandwich persillé", unitPriceCents: 700 },
  { sku: "SAL-010", name: "Sandwich jambon beurre cornichons", unitPriceCents: 650 },
  { sku: "SAL-011", name: "Quiche poireaux chèvre (part)", unitPriceCents: 600 },
  { sku: "SAL-012", name: "Salade César (barquette)", unitPriceCents: 1000 },
  { sku: "SAL-013", name: "Tranche tomate mozzarella", unitPriceCents: 700 },
  { sku: "SAL-014", name: "Quiche saumon épinards (part)", unitPriceCents: 700 },
  { sku: "SAL-015", name: "Salade de lentilles (barquette)", unitPriceCents: 850 },
  { sku: "SAL-016", name: "Tranche miel chèvre", unitPriceCents: 650 },
  { sku: "SAL-017", name: "Quiche légumes (part)", unitPriceCents: 550 },
  { sku: "SAL-018", name: "Sandwich rosette", unitPriceCents: 700 },
  { sku: "SAL-019", name: "Fougasse provençale", unitPriceCents: 650 },
  { sku: "SAL-020", name: "Croque courgette", unitPriceCents: 650 },
  { sku: "SAL-021", name: "Croque monsieur rustique", unitPriceCents: 650 },
  { sku: "SAL-022", name: "Tranche légumes", unitPriceCents: 650 },
  { sku: "SAL-023", name: "Sandwich maraîcher", unitPriceCents: 700 },
  { sku: "SAL-024", name: "Tartiflette (part)", unitPriceCents: 700 },
  { sku: "CHO-001", name: "Gros florentin lait", unitPriceCents: 600 },
  { sku: "CHO-002", name: "Gros florentin noir", unitPriceCents: 600 },
  { sku: "CHO-003", name: "Tablette chocolat maison lait 100 g", unitPriceCents: 1000 },
  { sku: "CHO-004", name: "Sablé Gianduja pièce 300 g", unitPriceCents: 650 },
  { sku: "CHO-005", name: "Magalinettes sachet 150 g", unitPriceCents: 1300 },
  { sku: "CHO-006", name: "Sablés Gianduja 200 g", unitPriceCents: 1700 },
  { sku: "CHO-007", name: "Boîte de florentins 220 g", unitPriceCents: 2800 },
  { sku: "CHO-008", name: "Grignottines boîte 150 g", unitPriceCents: 1700 },
  { sku: "CHO-009", name: "Œufs praliné 150 g", unitPriceCents: 1500 },
  { sku: "CHO-010", name: "Meringuettes noisette 100 g", unitPriceCents: 1000 },
  { sku: "CHO-011", name: "Oups 250 g - chocolat des montagnes", unitPriceCents: 3000 },
  { sku: "CHO-012", name: "Boîte de 6 pattes d'ourson", unitPriceCents: 1600 },
  { sku: "CHO-013", name: "Mendiants boîte 200 g", unitPriceCents: 1600 },
];
