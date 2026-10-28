# Plan — la fournée du jour v3 : des paliers, deux vues

> 📝 **Plan** du 2026-10-28. Hugo : « voici le design définitif que doit avoir
> l'app fournil » — dossier `handoff-fournee-v3/` (SPEC.md, maquette
> `design/Fournée du jour v3.dc.html`, cinq captures). Il s'ajoute à
> [`plan-fiche-atelier.md`](plan-fiche-atelier.md) (la fiche existante) et
> s'appuie sur [`plan-tranches-de-production.md`](plan-tranches-de-production.md)
> (les paliers SONT les tranches) et
> [`plan-raccourcis-du-fournil.md`](plan-raccourcis-du-fournil.md).
>
> Deux décisions du même jour :
>
> - **Contenant + raccourcis** : la page « Raccourcis du fournil » règle aussi le
>   **contenant principal** de chaque produit (`production_container`, le gros
>   bouton « + 1 plaque » et les touches « 1 plaque / 2 plaques » du pavé). Les
>   raccourcis restent des boutons en plus.
> - **La barre à paliers dans fold-ng** : `fold-meter` gagne des `segments`,
>   publié, puis monté au catalogue.

## 1. Ce qui existe (relu le 2026-10-28)

| La maquette demande                            | Aujourd'hui                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Les paliers d'une ligne (« 120 avant 7 h 00 ») | Les **tranches** : `GET …/due-thresholds`, rangées selon le mode, lues par la fiche à côté (`workshop-tranches.reader.ts`)        |
| « + 1 plaque » (contenant de la ligne)         | `WorkshopLine.container` et `quickLabel` existent ; **aucun écran ne règle le contenant** (seules les routes `…/containers/:sku`) |
| Les raccourcis                                 | Bâtis le 2026-10-28, boutons sous « Pièces sorties »                                                                              |
| « 1 commande attend · remise 8 h 45 »          | Lu par la Supervision (`awaitingProduction` des feuilles du colisage) ; **pas sur la fiche**                                      |
| La pastille du contrôle qualité sur la ligne   | Verdicts par SKU (`QualityLineStatus`, `supervision/quality-badges.ts`) ; **pas sur la fiche**                                    |
| Le pavé 3 × 4                                  | Un `fold-number-input` « Pièces sorties »                                                                                         |
| « Annuler la dernière » pendant 8 s            | L'annulation par puce existe ; **pas de bandeau**                                                                                 |
| Le bandeau de dérive qui nomme ses lignes      | `drift-banner/` existe, avec « Retirer la fiche »                                                                                 |
| La vue par tranche, la barre segmentée         | Rien ; `fold-meter` n'a pas de segments                                                                                           |

## 2. Le modèle : des paliers = les tranches

- `WorkshopLine.deadlines: { quantity, before }[]`, ordonnées, **somme =
  quantity** (SPEC §1). Le serveur les calcule avec la même règle que les
  tranches (`rangeInTranches`, mode fixe ou calculé), **non cumulées**.
- **La dérive va au dernier palier**. Sans échéance : un seul palier à l'heure
  de fin de fiche — à défaut d'une telle heure, `before: null` (« la journée »),
  sans heure inventée.
- Un palier `before_first` (besoin plus tôt que la première tranche) garde
  l'heure de la première tranche, et la ligne est en retard dès cette heure.
- Les fonctions du SPEC §1 (`steps`, `currentStep`, `stepRemaining`, `isLate`,
  `slots`) vivent côté écran, pures, dans un fichier neuf de la fiche (`workshop-deadlines`) ; « maintenant »
  vient de l'horloge de la fiche, pas d'un `new Date()` au rendu.
- La lecture à part des tranches par la fiche (`workshop-tranches.reader.ts`,
  `worksheet-tranches/`) est **remplacée** : les paliers arrivent avec la ligne.

## 3. Les données ajoutées à la ligne

- `deadlines` (§2) ;
- `waitingOrders: { count, earliestHandover: "HH:mm" | null }` — « 1 commande
  attend · remise 8 h 45 », sans nom de client : les commandes du jour dont une
  ligne de ce SKU attend le four. Lu là où la Supervision le lit (les feuilles
  du colisage, `awaitingProduction`), par un port du fournil, sans franchir de
  frontière nouvelle — à vérifier au bâti, et à dire s'il en faut une ;
- `quality: QualityLineStatus | null` — le dernier verdict du SKU, déjà connu de
  la production.

## 4. L'écran (SPEC §2–§4 et le panneau « Ce qui change »)

1. **Bascule** `fold-view-toggle` « Par produit · Par tranche », à droite du
   bandeau de rayon ; en tête de liste au téléphone. La tranche se lit dans le
   rayon courant.
2. **Par produit** : à gauche (112 px), le **reste du palier en cours** en gros
   (`60 / 120`, `avant 9 h 30`, rouge s'il est dépassé), puis `total : 60 / 240` ;
   ligne faite : `✓ fait`. À droite, la **barre à paliers** (`fold-meter`
   segmenté, largeur proportionnelle, 4 px d'écart, couleurs du SPEC §3) et
   `180 / 240 sorties`. Badge `En retard · 11 min`, liseré rouge.
3. **« + 1 plaque » est le geste principal** : bouton plein (52 px poste, 56 px
   téléphone), la taille du contenant dessous ; « Saisir » en contour à côté.
   Sans contenant : « Saisir » seul. Les raccourcis suivent, plus discrets.
4. **Saisir ouvre un pavé 3 × 4** à grosses touches (dialogue fold, feuille du
   bas au téléphone), prérempli du **reste du palier** (`+` reste total),
   raccourcis « reste », « 1 plaque », « 2 plaques », puis les raccourcis du
   produit. Plus de clavier système.
5. **Annuler la dernière** : après chaque fournée, un bandeau « Pain au chocolat
   - 24 · Annuler » 8 s ; au-delà, la puce garde son ✕ en deux temps.
6. **Ce qui presse** : « 1 commande attend · remise 8 h 45 » en ambre sur la
   ligne, et un point ambre sur l'onglet du rayon.
7. **Contrôle qualité** : la pastille (OK, Réserve, À revoir, Bloquant) sur la
   ligne, celle de la Supervision.
8. **Par tranche** : une carte par heure limite, dans l'ordre : Dépassée (alert),
   La prochaine (info, une seule), À venir, Tenue (fond sable). En-tête
   `avant 8 h 15`, la pastille, `24 à sortir sur 24` ; une rangée par produit :
   le manque du palier, `palier 1 sur 2 · plaque de 24`, mini-barre, « + 1
   plaque » et « Saisir ». « Saisir » depuis une tranche bascule en vue produit,
   pavé ouvert, prérempli du manque du palier.
9. **Téléphone** : une carte par ligne, deux boutons pleine largeur, les faites
   épinglées au pied avec leurs fournées annulables.

Tests : ceux du SPEC §6, plus l'arrondi « jamais plus tard » des paliers.

## 5. Le réglage du contenant

La page `/reglages/production/raccourcis` gagne, par ligne, le **contenant
principal** : singulier, pluriel, pièces (les routes
`PUT|DELETE /admin/production/containers/:sku` existent, sous
`production_worksheet` ; elles passent sous `production_settings`, le droit de
la page, comme les raccourcis). Les raccourcis restent à côté.

## 6. Lots

| Lot | Contenu                                                                                                         | Où            |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------- |
| F0  | `fold-meter` segmenté (`segments: { value, max, tone }[]`), release, montée du catalogue                        | fold-ng       |
| F1  | Contrat et serveur : `deadlines`, `waitingOrders`, `quality` sur `WorkshopLine` ; droit des routes du contenant | api, contrats |
| F2  | Le contenant sur la page des raccourcis                                                                         | back-office   |
| F3  | Par produit : reste du palier, barre à paliers, + 1 plaque, retard, qualité, ce qui presse                      | back-office   |
| F4  | Le pavé et « Annuler la dernière »                                                                              | back-office   |
| F5  | Par tranche, bascule, téléphone                                                                                 | back-office   |
