# Plan — le chemin du prix dans la commande passée par l'équipe

> 📐 **Plan, 2026-11-11.** Pas encore bâti. Demandé par Hugo : « on devrait
> ajouter chemin du prix dans la view nouvelle commande du staff non ? ». Il
> touche l'affichage d'un prix : il passe par `vitruve` avant Hugo. État de
> l'existant : [`commande-passee-par-l-equipe.md`](commande-passee-par-l-equipe.md) § 8.
>
> ⏸️ **Mis de côté par Hugo le 2026-11-12**, après le passage de `vitruve`.
> Reste à trancher : un preneur de commande sans le droit `b2b_pricing`
> voit-il la limite (`floorDecision`) ? Recommandé : non, le serveur la retire.
> Corrections de `vitruve` à porter avant de bâtir :
>
> - l'estimation sert `supersedes` vide, la passation le relit `[]` : l'e2e
>   compare la trace de l'estimation à `parseTrace` de la ligne passée, avec
>   une règle rivale et une limite dans les données ;
> - une troisième valeur de `PriceChain.origin` impose des `switch` exhaustifs
>   (`pricing-format.ts`, `price-path.ts`, `price-path.html`) ; `room: null` ;
> - `PriceExplain` exige `orderId` et `lineRules`, et `REJECTION_LABELS` dit
>   « à cette date » : en extraire un corps commun sur
>   `(trace, productName, unitPriceMillicents)` ;
> - `modifier-commande` passe par `quoteRevision` : hors du périmètre ;
> - Q4 est sans objet (l'estimation ne porte pas de `removedLines`).

## 1. En simple

Pendant une commande pour un client, chaque **ligne du panier** reçoit un
lien « Pourquoi ce prix ? ». Il ouvre le **chemin du prix** déjà utilisé
ailleurs : le tarif d'entrée, puis chaque étage qui a joué (mercuriale,
palier, promotion, geste), la limite s'il y en a une, et le prix final.

Cas d'usage réel du 2026-11-11 : sur Les Tommeuses, la baguette était à
1,22844 € HT malgré une mercuriale à −80 %. Le chemin aurait dit tout de suite
« la mercuriale ne vise que les croissants ; promotion pro −20 % ».

- **Le panier, pas la liste de gauche.** Le panier vient de l'**estimation**,
  qui compose la vraie commande (même calcul que la passation) : la trace de
  chaque ligne y existe déjà, au palier réellement atteint. La liste de gauche
  vient du rayon, qui ne garde pas de trace.
- **Rien n'est recalculé.** L'écran affiche la trace que l'estimation a
  produite.
- **Le chemin est dit « en cours »**, pas « figé » : tant que la commande n'est
  pas passée, la passation relit tout et fait foi.

## 2. Ce qui existe (vérifié le 2026-11-11)

- L'estimation compose la commande en mémoire ; chaque ligne composée porte sa
  trace (`pricing`, `OrderLinePricingTrace`). `OrderAmountsReading`
  (`orders/domain/entities/order-amounts-reading.ts`, ~l. 81) n'en garde que
  `basePriceMillicents`, que l'écran affiche en prix barré
  (`AdminOrderEstimateLineView`, `packages/contracts/src/admin-order-estimate.ts`).
- Le chemin du prix : composant `PricePath`
  (`b2b/tarification/price-path/price-path.ts`, entrée `PriceChain`), utilisé
  par la composition des mercuriales et par le panneau « Pourquoi ce prix ? »
  des commandes passées (`commandes/price-explain/`).
- `frozenChainOf(line: OrderLineView)` (`commandes/price-explain/frozen-chain.ts`)
  transforme une trace **figée** en `PriceChain` (`origin: 'frozen'`).
- L'estimation est une route staff (`b2b_place_order:write`) ; la trace entière
  (noms de règles, plancher, règles écartées) n'est jamais servie aux routes
  client (R27, `toCustomerOrder`). Elle peut donc partir ici.

## 3. Le bâti

### C1 — serveur : la trace dans l'estimation

- `AdminOrderEstimateLineView` gagne `pricing: OrderLinePricingTrace | null`,
  la trace de la ligne composée telle quelle. `basePriceMillicents` reste (il
  en est une lecture).
- `OrderAmountsReading` la porte jusqu'à `amountsViewOf`
  (`estimate-order-for-customer.handler.ts`). Aucune autre route ne change.
- Tests : unitaire du handler (la trace sort, identique à celle de la ligne
  composée) ; l'e2e `staff-estimate-parity` vérifie en plus que la trace de
  l'estimation égale celle que la passation fige sur la ligne.

### C2 — écran : « Pourquoi ce prix ? » sur une ligne du panier

- Un mapper `liveChainOf(line: AdminOrderEstimateLineView)` à côté de
  `frozenChainOf`, qui en partage le corps (une fonction commune sur la
  trace) ; `origin: 'estimate'` (nouvelle valeur de `PriceChain.origin`, si le
  type l'exige), libellé « en cours — la passation fait foi ».
- Le lien sur la ligne du panier ouvre un panneau fold (`FoldPanelHostService`,
  comme `PriceExplainPanel`) avec `PricePath`. Sans trace (`null`), pas de lien.
- Les règles écartées (`trace.rejected`) s'affichent comme dans le panneau des
  commandes passées. La reconstruction datée (`lineRules`) ne s'applique pas :
  il n'y a pas de commande.
- Tests : le mapper (étages, limite, sans trace), le lien absent sans trace,
  le panneau.

## 4. Questions pour `vitruve`

- **Q1** — le poids : la trace de chaque ligne à chaque estimation (toutes les
  400 ms de calme) alourdit-elle la réponse au point de compter ? Ordre de
  grandeur à mesurer sur un panier de 30 lignes.
- **Q2** — `PriceChain.origin` : une valeur de plus, ou le panneau prend-il
  un drapeau ? Ce que l'écran affiche selon l'origine.
- **Q3** — la marge (`room`) : `null` pour le figé ; pour une estimation, la
  montre-t-on (le commercial négocie au téléphone) ou non ?
- **Q4** — la trace d'une ligne au poids, et d'une ligne retirée du devis
  (`removedLines`) : rien à montrer, ou un mot ?

## 5. Ce qu'on ne fait pas

- Pas de chemin sur la liste de gauche (pas de trace au rayon ; ajouter
  l'article au panier suffit).
- Pas de route nouvelle : la trace part avec l'estimation.
