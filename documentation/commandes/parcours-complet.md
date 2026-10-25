# Le parcours complet d'une commande, de la prise à la facturation

> **État réel, relu contre le code le 2026-10-25** (HEAD `c95188d91` sur `dev`) ;
> **tout ce qui était bâti est en production depuis le déploiement du
> 2026-10-25 à 10 h 40** (`main` à `07ff2f541`, cinq déploiements verts). Chaque état, refus et décision dessiné ici a été
> ouvert dans `apps/lfd-api/src/` (chemins relatifs à `apps/lfd-api/` sauf
> mention). Trois états, et chacun se voit :
>
> - ✅ **en service** — sur `main`, donc en production (un merge dans `main`
>   déploie ; le déploiement lui-même n'est pas revérifié ici) ;
> - 🟦 **bâti, pas encore déployé** — sur `dev` seulement, en bleu dans les
>   schémas (aucun aujourd'hui) ;
> - 🟧 **prévu** — pas bâti, en pointillé orange, avec le lien vers son plan.
>
> Le bon de livraison, le départ incomplet et les montants facturables ont leur
> doc d'état, [`bon-de-livraison.md`](bon-de-livraison.md) ; ce qui reste du
> programme est au plan-cadre
> [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md).
> Ce document ne décrit pas : il montre, puis renvoie au document d'état de
> chaque étape.

Légende commune : losange = décision ; boîte rouge = refus ou sortie triste ;
boîte bleue = **bâtie sur `dev`, pas encore en production** ; boîte orange en
pointillé = **prévue, pas bâtie**. Une boîte sans couleur est en service.

## 0. Vue d'ensemble — les sept étapes

```mermaid
flowchart LR
    S1["1 · Prise de commande"] --> S2["2 · Arrêt du plan<br/>et fournil"]
    S2 --> S3["3 · Colisage"]
    S3 --> S4["4 · Départ<br/>comptoir ou tournée"]
    S4 --> S5["5 · Date de réception"]
    S5 --> S7["7 · Facture<br/>et prélèvement"]
    S6["6 · Annulation<br/>et modification"] -.->|"avant l'arrêt du plan"| S1
    S6 -.->|"bloquée dès l'inscription"| S2
    BL["Bon de livraison<br/>prévu à l'arrêt, suit la commande<br/>(E1, E2, E4a)"]
    S2 --> BL
    BL --> S7
    INC["Départ incomplet<br/>décidé, BL partiel (E6)"]
    S3 --> INC --> BL
    REL["Reliquat, solde, remboursement<br/>(E7–E9)"]:::prevu
    INC -.-> REL
    classDef bati fill:#e3f2fd,stroke:#1565c0
    classDef prevu fill:#fff3e0,stroke:#e65100,stroke-dasharray: 5 5
```

| Étape | Qui agit                      | Ce qui en sort                                                                                            | État |
| ----- | ----------------------------- | --------------------------------------------------------------------------------------------------------- | ---- |
| 1     | client, équipe, visiteur      | une commande `placed`, un règlement `not_required` ou `pending`                                           | ✅   |
| 2     | le fournil (ou l'arrêt auto)  | les commandes réglées deviennent `confirmed`, les autres tombent ; chaque confirmée reçoit son BL-1 prévu | ✅   |
| 3     | le coliseur                   | la commande devient `ready` à la fermeture du bac, son BL `prepared`                                      | ✅   |
| 3 bis | le coliseur, puis un décideur | « Il manque », puis un départ incomplet décidé : BL partiel, reste abandonné                              | ✅   |
| 4     | le comptoir, le livreur       | l'attestation de retrait, la commande devient `fulfilled`, son BL `handed_over`                           | ✅   |
| 5     | personne : une règle          | `received_on`, écrit dans la même instruction que le retrait, recopié sur le BL                           | ✅   |
| 6     | client, équipe                | `cancelled`, son BL non remis `voided`, et un remboursement si la carte avait payé                        | ✅   |
| 7     | l'automate ou la comptabilité | facture (mensuelle au compte, ou carte), lot de prélèvement ; sur les montants facturables                | ✅   |

## 1. La prise de commande

Documents d'état : [`passation/architecture-flux-commande-zero-friction.md`](passation/architecture-flux-commande-zero-friction.md),
[`passation/architecture-commande-saisie-par-l-equipe.md`](passation/architecture-commande-saisie-par-l-equipe.md),
[`passation/architecture-commande-sans-compte.md`](passation/architecture-commande-sans-compte.md),
[`../comptoir/architecture-commande-au-comptoir.md`](../comptoir/architecture-commande-au-comptoir.md),
[`passation/architecture-idempotence-de-passation.md`](passation/architecture-idempotence-de-passation.md),
[`../limites-de-commande/README.md`](../limites-de-commande/README.md).

```mermaid
flowchart TD
    A{"Qui commande ?"} -->|"client connecté"| PO["PlaceOrder"]
    A -->|"équipe, pour un client<br/>(commercial, comptoir)"| PC["PlaceOrderForCustomer"]
    A -->|"visiteur sans compte<br/>(boutique publique)"| PS["PlaceShopOrder<br/>enregistre l'acheteur"]
    PO --> I{"Clé d'idempotence ?"}
    PS --> I
    I -->|"même clé, autre contenu"| E1["Refus : clé réutilisée"]:::sad
    I -->|"même clé, en cours"| E2["Refus : déjà en vol"]:::sad
    I -->|"même clé, déjà passée"| R["Rend la commande déjà écrite"]
    I -->|"neuve"| W
    PC --> W{"Mur société :<br/>rôle dans la société ?"}
    W -->|"aucun rôle"| E3["Refus d'accès"]:::sad
    W -->|"ok ou sans société"| O{"Commandes ouvertes<br/>à cette clientèle ?"}
    O -->|"non"| E4["OrdersClosedForAudience"]:::sad
    O -->|"oui"| J{"Jour demandé :<br/>plan arrêté ?"}
    J -->|"arrêté, client"| E5["ProductionPlanClosed"]:::sad
    J -->|"arrêté, équipe"| OFF["Passe hors plan<br/>(placedOffPlan)"]
    J -->|"ouvert"| SD{"Jour même autorisé ?"}
    SD -->|"non"| E6["SameDayOrderClosed"]:::sad
    SD -->|"oui"| C{"Heure limite<br/>la plus stricte des lignes"}
    OFF --> C
    C -->|"ouverte"| P["Prix, remises, TVA<br/>calculés par l'agrégat"]
    C -->|"grâce + dérogation"| LF["Dérogation consommée<br/>+ surtaxe de retard figée"]
    C -->|"grâce sans dérogation"| E7["OrderCutoffGrace"]:::sad
    C -->|"passée"| E8["PastOrderCutoff"]:::sad
    LF --> P
    P --> SET{"Règlement"}
    SET -->|"au compte accordé, ou total nul"| NR["paiement not_required"]
    SET -->|"« au compte » demandé, non accordé"| E9["TermsNotGranted"]:::sad
    SET -->|"carte (choisie, ou pas de compte)"| PI["Intention Stripe<br/>paiement pending"]
    NR --> PL["orders.place : statut placed<br/>numéro + jeton de retrait<br/>fait commerce.order_placed"]
    PI --> PL
    classDef sad fill:#ffebee,stroke:#c62828
```

| Décision                | Qui décide                                                | Ce qui se passe                                                                                                    | État |
| ----------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---- |
| Idempotence             | `place-order.handler.ts`, `place-shop-order.handler.ts`   | clé + empreinte du contenu : rejeu rendu, clé détournée ou en vol refusée                                          | ✅   |
| Mur société             | `OrderGuardReader.roleOf` (rôle relu en base)             | sans rôle dans la société, la commande ne part pas                                                                 | ✅   |
| Ouverture par clientèle | `order-intake.service.ts`                                 | réglage d'ouverture de la boutique, par audience                                                                   | ✅   |
| Plan arrêté             | `order-drafting.service.ts` (`ensureDayOpen`, `holdPlan`) | client refusé ; équipe acceptée, la commande est marquée hors plan                                                 | ✅   |
| Jour même               | `order-plan-gate.service.ts`                              | réglage « commande le jour même » ; sinon refus                                                                    | ✅   |
| Heure limite            | `order-cutoff-guard.ts` (la plus stricte des lignes)      | ouverte : passe ; grâce : seulement avec une dérogation, qui ajoute la surtaxe de retard ; passée : refus          | ✅   |
| Carte ou au compte      | `order-settlement.ts`                                     | au compte accordé ou total nul → `not_required` ; sinon carte → `pending` ; « au compte » forcé sans droit → refus | ✅   |

## 2. L'arrêt du plan et le fournil

Documents d'état : [`../production/arret-du-plan.md`](../production/arret-du-plan.md),
[`../production/architecture-contexte-production.md`](../production/architecture-contexte-production.md),
[`reglement/architecture-reglement-et-compte-de-production.md`](reglement/architecture-reglement-et-compte-de-production.md),
[`../reassort-boutiques/plan-reapprovisionnement.md`](../reassort-boutiques/plan-reapprovisionnement.md).

```mermaid
flowchart TD
    T["Heure d'arrêt du jour J<br/>(tour automatique ou geste du fournil)"] --> SW["Balayage des règlements :<br/>cartes pending/failed du jour"]
    SW --> SP{"Stripe : l'intention<br/>s'annule-t-elle ?"}
    SP -->|"non, payée à l'instant"| KEEP["Épargnée : reste au plan"]
    SP -->|"oui"| FAIL["cancelled + failed<br/>bon de fidélité libéré"]:::sad
    KEEP --> CL
    SW --> CL{"Le jour a-t-il<br/>quelque chose à produire ?"}
    CL -->|"rien"| E1["ProductionDayEmpty"]:::sad
    CL -->|"oui"| SNAP["Instantané figé<br/>fait production.day_closed"]
    SNAP --> ABS["Commerce : placed + réglée<br/>→ confirmed (inscrite)"]
    SNAP --> RET{"Une commande arrive après<br/>(équipe, hors plan) ?"}
    RET -->|"oui"| RT["Retirage : absorbée<br/>dans le jour arrêté"]
    SNAP --> RO{"Rouvrir le plan ?"}
    RO -->|"fournée lancée"| E2["ReopenAfterBatches"]:::sad
    RO -->|"colisage commencé"| E3["ReopenAfterPacking"]:::sad
    RO -->|"tournée partie"| E4["ReopenAfterDispatch"]:::sad
    RO -->|"rien commencé"| REL["Plan rouvert :<br/>confirmed → placed"]
    ABS --> BLP["BL-1 prévu, lignes et totaux<br/>recopiés (ou BL prévu réécrit)"]
    REL --> KEEPD["Une commande au départ décidé<br/>reste confirmed"]
    RS["Réassort d'une boutique"] --> LR["Lancement : arrête le jour<br/>s'il était ouvert"]
    classDef bati fill:#e3f2fd,stroke:#1565c0
    classDef sad fill:#ffebee,stroke:#c62828
```

| Décision             | Qui décide                                                  | Ce qui se passe                                                                           | État |
| -------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---- |
| Une carte non réglée | `pending-settlement-sweep.service.ts`                       | annulée à l'arrêt, sauf si Stripe refuse d'annuler (elle vient d'être payée)              | ✅   |
| Qui entre au plan    | `production-plan.ts` (`absorbedByPlan`) et `plan-filter.ts` | statut `placed` et règlement ni `pending`, ni `failed`, ni `refunded`                     | ✅   |
| Le jour vide         | `ProductionDay.close`                                       | refusé s'il n'y a ni commande, ni réassort                                                | ✅   |
| Retirage             | `ProductionDay.retake`                                      | une arrivée après l'arrêt est absorbée ; rien de neuf, rien d'écrit                       | ✅   |
| Réouverture          | `production-day.reopening.ts`                               | seulement si rien n'est cuit, colisé ou parti ; le commerce rend les commandes à `placed` | ✅   |
| Réassort             | `ProductionDay.launchResupply`                              | un réassort lancé arrête le jour s'il était ouvert                                        | ✅   |
| BL-1 prévu           | `DeliveryNotePlanner.planConfirmed` (`b2b/delivery-notes/`) | chaque commande que l'arrêt confirme (`confirmedAt = closedAt`) ; un refus est journalisé | ✅   |
| Réouverture, décidée | `prisma-order-plan-release.ts` (`releaseFromPlan`)          | une commande au départ décidé n'est pas rendue à `placed`                                 | ✅   |

## 3. Le colisage

Documents d'état : [`../colisage/colisage.md`](../colisage/colisage.md),
[`../colisage/parcours-du-coliseur.md`](../colisage/parcours-du-coliseur.md),
[`../colisage/chargement-les-bacs.md`](../colisage/chargement-les-bacs.md),
[`../production/plan-controle-qualite.md`](../production/plan-controle-qualite.md).

```mermaid
flowchart TD
    L["Liste à coliser publiée<br/>par le fournil"] --> AL["Répartir les lignes<br/>dans des contenants"]
    AL --> Q{"Toute la quantité<br/>répartie ?"}
    Q -->|"non"| E1["UnallocatedLines :<br/>le bac ne se ferme pas"]:::sad
    E1 --> INC["« Il manque » : quantités au bac figées<br/>fait packing.shortfall_reported"]
    INC --> WAIT["Commande : « décision attendue »<br/>(page Commandes, Supervision)"]
    WAIT --> DEC{"Décider du départ<br/>(b2b_orders_shortfall)"}
    DEC -->|"carte, bon de fidélité, trop ancienne,<br/>rien au bac, bac changé, bac fermé"| E3["Refus nommé"]:::sad
    DEC -->|"ça part, reste abandonné"| AUT["Lignes dues réduites,<br/>BL prévu réécrit aux quantités décidées"]
    AUT --> SEAL
    WAIT -.->|"reste à relivrer (E7)"| RLQ["Reliquat, BL-2"]:::prevu
    Q -->|"oui"| SEAL["Fermer le bac (seal)<br/>fait packing.order_packed"]
    SEAL --> RD["Commerce : → ready<br/>(sauf annulée, retirée)"]
    SEAL --> BL["BL → prepared"]
    SEAL --> RO{"Rouvrir le bac ?"}
    RO -->|"bac chargé ou tournée partie"| E2["Refus de la livraison<br/>(BinDesk)"]:::sad
    RO -->|"sinon"| OPEN["Rangement rouvert ;<br/>la commande reste ready"]
    QC{"Contrôle qualité<br/>du lot"} -->|"bloquant"| HOLD["Commande retenue :<br/>ni retrait, ni départ"]:::sad
    QC -->|"ok / avertissement"| FREE["Rien ne bloque"]
    classDef bati fill:#e3f2fd,stroke:#1565c0
    classDef prevu fill:#fff3e0,stroke:#e65100,stroke-dasharray: 5 5
    classDef sad fill:#ffebee,stroke:#c62828
```

| Décision           | Qui décide                                                                                            | Ce qui se passe                                                                                                           | État |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---- |
| Fermer le bac      | `PackingSheet.seal`                                                                                   | refusé tant qu'une ligne due n'est pas entièrement répartie ; après une décision, la ligne due **est** la quantité au bac | ✅   |
| Passer `ready`     | `mark-order-ready.handler.ts`, `markReady` (statut en `where`)                                        | refusé pour une commande annulée, brouillon ou déjà retirée                                                               | ✅   |
| Rouvrir le bac     | `PackingSheet.reopen` + `BinDesk` de la livraison                                                     | refusé si le bac est chargé ou parti ; la commande reste `ready`                                                          | ✅   |
| Retenue qualité    | `QualityCheck` (verdict `blocking`)                                                                   | la commande ne peut ni être retirée, ni partir en tournée                                                                 | ✅   |
| Signaler un manque | `PackingSheet.reportShortfall`, puis `OrderShortfall` au commerce                                     | fige les quantités au bac ; refermer le bac complet efface le signal                                                      | ✅   |
| Départ incomplet   | `ShortfallDecision.decide` + `ShortfallDesk.authorize` ([`bon-de-livraison.md`](bon-de-livraison.md)) | au compte seulement ; reste abandonné ; « à relivrer » attend E7                                                          | ✅   |
| Réimprimer le BL   | `content_version` ≠ version imprimée                                                                  | « Le bon de livraison a changé depuis son impression » au poste et sur la fiche                                           | ✅   |

## 4. Le départ : comptoir ou tournée

Documents d'état : [`la-commande/vie-du-qr-d-une-commande.md`](la-commande/vie-du-qr-d-une-commande.md),
[`../production/architecture-contexte-retrait.md`](../production/architecture-contexte-retrait.md),
[`../livraisons/tournees/composition-automatique.md`](../livraisons/tournees/composition-automatique.md),
[`../livraisons/livreur/a-la-porte.md`](../livraisons/livreur/a-la-porte.md),
[`../livraisons/livreur/parcours-du-livreur.md`](../livraisons/livreur/parcours-du-livreur.md),
[`../supervision/architecture-supervision-du-jour.md`](../supervision/architecture-supervision-du-jour.md).

```mermaid
flowchart TD
    M{"Acheminement"} -->|"retrait"| QR["Scan du QR au comptoir<br/>ou confirmation manuelle"]
    M -->|"livraison"| DEP{"Départ de la tournée"}
    QR --> HB{"handoverBlocker"}
    HB -->|"annulée / brouillon"| E1["Refus"]:::sad
    HB -->|"déjà retirée"| E2["Refus : déjà retirée"]:::sad
    HB -->|"carte non réglée"| E3["Refus : non réglée"]:::sad
    HB -->|"retenue qualité"| E4["Refus : retenue"]:::sad
    HB -->|"ok"| ATT["Attestation (via scan ou manual)<br/>fait handover.handed_over"]
    DEP -->|"tournée vide"| E5["EmptyDeliveryRound"]:::sad
    DEP -->|"bac sans étiquette ou partiel"| E6["DeliveryRoundNotReady"]:::sad
    DEP -->|"bac partagé à refaire"| E7["SharedBinToRedo"]:::sad
    DEP -->|"commande annulée ou retenue"| E8["DepartureOrderCancelled / Held"]:::sad
    DEP -->|"ok"| ROAD["Tournée partie"]
    ROAD --> DOOR{"À la porte"}
    DOOR -->|"remis en main"| HO["Photo + signature"]
    DOOR -->|"absent, dépôt autorisé<br/>par le commercial"| DP["Déposé avec preuve (photo)"]
    DOOR -->|"le commercial dit « rapporter »"| BB["Arrêt clos, commande rapportée"]:::sad
    HO --> ATT
    DP --> ATT
    ATT --> FUL["Commerce : → fulfilled<br/>+ received_on (étape 5)"]
    ATT --> BLR["BL → handed_over (créé plein s'il manquait)<br/>puis le solde : montants facturables"]
    BLR --> SOL["Montants facturables posés<br/>(billable_*, settled_on)"]
    ATT -.-> BLD["Le retrait par BL : un QR,<br/>le BL prêt remis (E7.3)"]:::prevu
    classDef bati fill:#e3f2fd,stroke:#1565c0
    classDef prevu fill:#fff3e0,stroke:#e65100,stroke-dasharray: 5 5
    classDef sad fill:#ffebee,stroke:#c62828
```

| Décision             | Qui décide                                         | Ce qui se passe                                                                  | État |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- | ---- |
| Retrait au comptoir  | `OrderHandover.attest` → `handoverBlocker`         | refus si annulée, déjà retirée, carte non réglée ou retenue qualité              | ✅   |
| Départ de la tournée | `DeliveryRound.depart`, feuille de départ          | refus si vide, bac incomplet, bac partagé à refaire, commande annulée ou retenue | ✅   |
| Dépôt à la porte     | `StopDecision.authorizeDeposit` (le commercial)    | le livreur peut alors « déposer avec preuve » ; la dernière réponse l'emporte    | ✅   |
| Rapporter            | `StopDecision.bringBack`                           | l'arrêt se clôt sans retrait ; la commande n'est pas `fulfilled`                 | ✅   |
| Clore sans retrait   | `close-stop-without-handover.handler.ts`           | permis seulement si la commande n'est plus « à remettre » (annulée, etc.)        | ✅   |
| Passer `fulfilled`   | `mark-order-fulfilled.handler.ts`, `markFulfilled` | une seule fois (`handed_over_at` nul), jamais sur une annulée                    | ✅   |
| Le BL suit           | `DeliveryNoteFollower.handOver`                    | BL remis dans la même unité de travail ; BL plein s'il n'existait pas (Q-E5)     | ✅   |
| Le solde             | `OrderBillingCloser.closeLocked`                   | montants facturables : recopie de la commande, ou Σ des BL remis si décidée      | ✅   |

## 5. La date de réception

Document d'état : [`la-commande/date-de-reception.md`](la-commande/date-de-reception.md).

```mermaid
flowchart TD
    F["Fait handover.handed_over"] --> W{"Retrait à la porte ?"}
    W -->|"oui"| D1["Jour de service du dernier arrêt<br/>parti, clos, non rapporté"]
    W -->|"non"| D2["Jour de Paris<br/>de l'instant du retrait"]
    D1 --> N{"Une date lisible ?"}
    D2 --> N
    N -->|"non"| D3["Repli : jour de Paris<br/>de l'instant du fait"]
    N -->|"oui"| U["Un seul UPDATE :<br/>handed_over_at + received_on + fulfilled"]
    D3 --> U
    U --> INV["L'assiette de la facture<br/>lit received_on"]
    U --> BLD["Recopiée sur le BL remis<br/>(delivery_note.received_on)"]
    U -.-> LAST["« Reçue le » = dernier BL<br/>d'une commande en plusieurs BL (E7)"]:::prevu
    classDef prevu fill:#fff3e0,stroke:#e65100,stroke-dasharray: 5 5
```

| Décision       | Qui décide                                   | Ce qui se passe                                                      | État |
| -------------- | -------------------------------------------- | -------------------------------------------------------------------- | ---- |
| Quel jour      | `receivedOnOrDayOf` (`monthly-invoicing.ts`) | porte → jour de l'arrêt ; sinon jour de Paris ; repli : jour du fait | ✅   |
| Inséparabilité | contraintes `CHECK` de `orders`              | la base refuse un retrait sans date, ou une date sans retrait        | ✅   |

## 6. Annulation et modification

Documents d'état : [`annulation/annulation-par-le-staff.md`](annulation/annulation-par-le-staff.md),
[`annulation/annulation-par-le-client.md`](annulation/annulation-par-le-client.md),
[`annulation/verrous-de-l-annulation.md`](annulation/verrous-de-l-annulation.md),
[`reglement/architecture-abandon-du-reglement.md`](reglement/architecture-abandon-du-reglement.md),
[`modification/plan-modifier-une-commande.md`](modification/plan-modifier-une-commande.md).

```mermaid
flowchart TD
    A{"Qui ?"} -->|"équipe"| ST["CancelOrder"]
    A -->|"client"| CU{"Fenêtre client ouverte ?<br/>(jusqu'au début du jour de service)"}
    A -->|"visiteur, par lien"| CU
    A -->|"client, carte pas encore réglée"| AB{"Abandon du règlement"}
    CU -->|"non"| E0["Trop tard"]:::sad
    CU -->|"oui"| ST
    ST --> LK["Verrou FOR UPDATE<br/>sur la commande"]
    LK --> S{"Statut"}
    S -->|"cancelled / ready / fulfilled / brouillon"| E1["Refus nommé"]:::sad
    S -->|"inscrite au plan (confirmed)"| E2["Refus : en préparation"]:::sad
    S -->|"placed"| R{"Régime de règlement"}
    R -->|"au compte"| AC{"Facturée, en prélèvement,<br/>prélevée, réglée autrement ?"}
    AC -->|"oui"| E3["Refus : engagée en compta"]:::sad
    AC -->|"non"| OK["→ cancelled"]
    R -->|"gratuite"| OK
    R -->|"carte due"| OKF["→ cancelled + failed"]
    R -->|"carte payée"| RF{"Remboursement<br/>déjà en vol ?"}
    RF -->|"oui"| E4["Refus : paiement en cours"]:::sad
    RF -->|"non"| OKP["→ cancelled ;<br/>remboursement Stripe demandé"]
    OKP --> LED["Carnet des remboursements :<br/>paid → refunded"]
    AB -->|"publique"| ABP["cancelled + failed"]
    AB -->|"pro"| ABQ["failed seulement ;<br/>tombera à l'arrêt du plan"]
    MOD["Modifier (révision)"] --> MR{"Révisable ?"}
    MR -->|"non annulable, ou carte,<br/>ou plan arrêté, ou heure passée"| E5["Refus"]:::sad
    MR -->|"départ incomplet décidé"| E6["Refus : décision prise"]
    MR -->|"oui"| REV["Révision acceptée"]
    OK --> VO["BL non remis → voided"]
    OKF --> VO
    OKP --> VO
    E2 -.->|"annuler, modifier après l'arrêt (A1, A2)"| AA["Par décision de l'équipe"]:::prevu
    classDef bati fill:#e3f2fd,stroke:#1565c0
    classDef prevu fill:#fff3e0,stroke:#e65100,stroke-dasharray: 5 5
    classDef sad fill:#ffebee,stroke:#c62828
```

| Décision                  | Qui décide                                              | Ce qui se passe                                                                          | État |
| ------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---- |
| Annulable ?               | `order-cancellation.ts` (`cancellationOf`)              | seulement `placed` et non inscrite ; au compte, seulement si rien n'est engagé en compta | ✅   |
| Jusqu'à quand (client)    | `customer-cancellation-window.ts`                       | ancrée sur le début du jour de service (ou du créneau) ; après, « trop tard »            | ✅   |
| Écriture                  | `prisma-order-cancellation.repository.ts`               | quatre `updateMany` exclusifs par régime, tous conditionnés par `status: placed`         | ✅   |
| Remboursement             | carnet `OrderRefundLedger`, balayage des remboursements | règlement inchangé à l'annulation ; `refunded` quand Stripe a rendu                      | ✅   |
| Paiement après annulation | `refund-paid-after-cancellation.handler.ts`             | `markPaid` refuse une annulée ; l'argent arrivé est rendu                                | ✅   |
| Abandon                   | `order-abandon.ts`, `markAbandoned`                     | publique : annulée ; pro : règlement `failed`, la commande attend l'arrêt                | ✅   |
| Expiration boutique       | `unsettled-shop-order-expiry.ts` (30 min)               | une commande boutique non réglée expire : `cancelled` + `failed`                         | ✅   |
| Modifier                  | `order-revisability.ts`                                 | refusé si non annulable, réglée par carte, plan arrêté ou heure limite passée            | ✅   |
| Le BL d'une annulée       | `DeliveryNoteFollower.voidLiveFor`                      | un BL non remis passe `voided` ; son numéro n'est jamais réemployé                       | ✅   |
| Modifier une décidée      | erreur `orders.revise.shortfall_decided`                | une commande au départ décidé ne se révise plus                                          | ✅   |

## 7. Facture et prélèvement

Documents d'état : [`../comptabilite/facturation/README.md`](../comptabilite/facturation/README.md),
[`../comptabilite/facturation/facture-emise.md`](../comptabilite/facturation/facture-emise.md),
[`../comptabilite/facturation/facture-carte-et-remboursements.md`](../comptabilite/facturation/facture-carte-et-remboursements.md),
[`../comptabilite/facturation/le-prelevement-suit-la-facture.md`](../comptabilite/facturation/le-prelevement-suit-la-facture.md),
[`../comptabilite/prelevement/procedure-de-prelevement.md`](../comptabilite/prelevement/procedure-de-prelevement.md),
[`../comptabilite/prelevement/lot-de-prelevement-fige.md`](../comptabilite/prelevement/lot-de-prelevement-fige.md),
[`../comptabilite/prelevement/retours-bancaires.md`](../comptabilite/prelevement/retours-bancaires.md),
[`../comptabilite/prelevement/plan-lot-rejete-par-la-banque.md`](../comptabilite/prelevement/plan-lot-rejete-par-la-banque.md).

```mermaid
flowchart TD
    O{"Régime de la commande"} -->|"au compte<br/>(not_required, total > 0, société)"| MI["Clôture de la période<br/>(rythme du payeur)"]
    O -->|"carte, pro"| CI{"Verdict facture carte"}
    O -->|"publique ou gratuite"| NONE["Pas de facture émise"]
    CI -->|"pas payée"| W1["Attend le paiement"]
    CI -->|"pas retirée"| W2["Attend le retrait"]
    CI -->|"remboursée en totalité"| NO["Pas de facture"]
    CI -->|"émissible"| FC["Facture carte (380)<br/>+ avis par courriel"]
    MI --> MC{"Clôture valide<br/>et ouverte ?"}
    MC -->|"non"| E1["NotABillingClosure /<br/>PeriodNotYetInvoiceable"]:::sad
    MC -->|"oui"| FM["Facture mensuelle :<br/>commandes reçues dans la période<br/>+ avis par courriel"]
    FM --> CB["Constitution des lots<br/>(pré-notifications envoyées)"]
    CB -->|"rien à prélever"| E2["NothingToCollect"]:::sad
    CB --> LOT{"Lot constituted"}
    LOT -->|"annulé"| CX["cancelled"]:::sad
    LOT -->|"société sans mandat, fichier<br/>jamais téléchargé, avis non partis"| E3["Dépôt refusé"]:::sad
    LOT -->|"dépôt"| DEPO["deposited"]
    DEPO -->|"rejet de la banque<br/>avant l'échéance"| REJ["rejected_by_bank<br/>les factures redeviennent prélevables"]:::sad
    DEPO --> RET{"Retour bancaire<br/>sur une ligne ?"}
    RET -->|"non"| PAID["Prélevée"]
    RET -->|"oui"| CR["Impayé : en attente"]:::sad
    CR --> RES{"Résolution"}
    RES -->|"représenter"| REP["represented"]
    RES -->|"réglée autrement"| SO["settled_otherwise"]
    RES -->|"passer en perte"| WO["written_off"]
    FM --> BLF["La facture lit les montants facturables<br/>(billable_*, settled_on), cite commandes et BL"]
    BLF --> NS["Bon remis non soldé :<br/>bloqueur order_unsettled"]:::sad
    BLF -.-> RFD["Avoir sur réserve (R2),<br/>remboursement d'un reste (E9)"]:::prevu
    classDef bati fill:#e3f2fd,stroke:#1565c0
    classDef prevu fill:#fff3e0,stroke:#e65100,stroke-dasharray: 5 5
    classDef sad fill:#ffebee,stroke:#c62828
```

| Décision                   | Qui décide                                                    | Ce qui se passe                                                                                                      | État |
| -------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---- |
| Facturable au compte       | `billable-order-criterion.ts`                                 | `not_required`, total > 0, non annulée, avec société, `received_on` dans la période                                  | ✅   |
| Facturable au compte       | `billable-order-criterion.ts`                                 | `settled_on` dans la période **et** `billable_total_cents` posé ; non soldée : nommée (`order_unsettled`)            | ✅   |
| Le gel                     | déclencheur `orders_billable_frozen`                          | une commande facturée, relevée ou prélevée ne change plus de montants facturables : un écart se reprend par un avoir | ✅   |
| Facture mensuelle          | `issue-monthly-invoices.handler.ts` (et son automate)         | refusée hors clôture ou avant son ouverture ; avis envoyé au payeur                                                  | ✅   |
| Facture carte              | `card-invoicing.ts`, déclenchée au paiement **et** au retrait | émise au second des deux ; jamais pour un particulier, ni remboursée en totalité                                     | ✅   |
| Relevé (arrêté)            | `BillingStatement`, à la constitution                         | les payeurs hors régime « facture » sont prélevés sur un arrêté figé                                                 | ✅   |
| Constitution d'un lot      | `constitute-collection-batches.handler.ts`                    | refusée s'il n'y a rien ; pré-notifications mises en file                                                            | ✅   |
| Dépôt                      | `CollectionBatch.markDeposited`                               | refusé si un payeur n'a pas de mandat, si le fichier n'a jamais été téléchargé, si un avis n'est pas parti           | ✅   |
| Rejet du lot par la banque | `CollectionBatch.rejectByBank`                                | seulement un lot déposé, avant l'échéance, sans aucun retour                                                         | ✅   |
| Retour (impayé)            | `CollectionReturn`                                            | sur un lot déposé, montant exact ; puis représenter, régler autrement ou passer en perte                             | ✅   |

## 8. Les statuts réels

`OrderStatus` et `PaymentStatus` (`prisma/schema/public/orders.prisma`), avec
leur seul écrivain. Deux valeurs de `OrderStatus` existent dans l'énuméré
**sans aucun écrivain** dans le code au 2026-10-25 : `draft` (les brouillons
vivent dans `order_drafts`) et `in_production`. Elles ne sont que lues.

```mermaid
stateDiagram-v2
    [*] --> placed: place (les trois portes)
    placed --> confirmed: arrêt du plan, réglée (absorbIntoPlan)
    confirmed --> placed: réouverture du plan (releaseFromPlan)
    placed --> ready: bac fermé (markReady)
    confirmed --> ready: bac fermé (markReady)
    ready --> fulfilled: retrait attesté (markFulfilled)
    confirmed --> fulfilled: retrait attesté
    placed --> fulfilled: retrait attesté
    placed --> cancelled: annulation, abandon public, arrêt, expiration
    fulfilled --> [*]
    cancelled --> [*]
```

```mermaid
stateDiagram-v2
    [*] --> not_required: au compte ou total nul
    [*] --> pending: carte
    pending --> paid: webhook Stripe (markPaid)
    failed --> paid: nouvel essai réussi
    pending --> failed: webhook, abandon, arrêt, expiration, annulation
    paid --> refunded: carnet des remboursements
    refunded --> paid: remboursement annulé ou rejeté
    not_required --> [*]
```

Le cycle de vie du bon de livraison (`planned` → `prepared` → `handed_over`,
ou `voided`) est dessiné dans [`bon-de-livraison.md`](bon-de-livraison.md).

| Transition                           | Écrivain (`src/b2b/orders/infrastructure/`)                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| → `placed`                           | `prisma-order.repository.ts` `place`                                                                                    |
| `placed` → `confirmed`               | `absorbIntoPlan`, sur le fait `production.day_closed`                                                                   |
| `confirmed` → `placed`               | `prisma-order-plan-release.ts`, sur le fait de réouverture                                                              |
| → `ready`                            | `markReady`, sur le fait `packing.order_packed`                                                                         |
| → `fulfilled`                        | `markFulfilled`, sur le fait `handover.handed_over`                                                                     |
| → `cancelled`                        | `prisma-order-cancellation.repository.ts`, `markAbandoned`, `failAtClosing`, `prisma-unsettled-shop-order.canceller.ts` |
| `pending`/`failed` → `paid`/`failed` | `markPaid`, `markPaymentFailed` (refusés sur une annulée)                                                               |
| `paid` ↔ `refunded`                  | `prisma-order-refund.repository.ts` `save`                                                                              |

## 9. La carte : ce qui existe, ce qui reste

```mermaid
flowchart LR
    subgraph Service["✅ En service (main)"]
        P1["Passation, arrêt du plan,<br/>colisage, retrait, réception"]
        P2["Annulation avant l'arrêt,<br/>révision M1"]
        P3["Facture mensuelle et carte,<br/>relevé, prélèvement"]
        B1["BL prévu, qui suit la commande,<br/>avec ses totaux (E1, E2, E4a)"]
    end
    subgraph Dev["✅ En service depuis le 2026-10-25"]
        D1["BL imprimé, confirmation<br/>de commande (E5a, E5b)"]
        D2["Il manque, décision, BL partiel<br/>(E6a, E6b, E6c1)"]
        D3["Facture sur montants facturables,<br/>gel (E6c2)"]
        D4["Écrire au client (E6d)"]
        D5["Commandes de test par<br/>la vraie passation (lot T)"]
    end
    subgraph Reste["🟧 Prévu"]
        R1["Reliquat, retrait par BL<br/>(E3 + E7)"]:::prevu
        R2["Solder un reste (E8),<br/>rembourser (E9)"]:::prevu
        R3["Annuler, modifier<br/>après l'arrêt (A1, A2)"]:::prevu
        R4["L'arrêt du plan comme publication<br/>avec ajustements (étude)"]:::prevu
        R5["Réserve et avoir (R1, R2),<br/>hors plan et statuts morts (H1, H2)"]:::prevu
    end
    B1 --> D2 --> R1
    D3 --> R2
    classDef bati fill:#e3f2fd,stroke:#1565c0
    classDef prevu fill:#fff3e0,stroke:#e65100,stroke-dasharray: 5 5
```

| Sujet                                                                                          | État | Où                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le BL prévu à l'arrêt, qui suit la commande, avec ses totaux ; le réconciliateur (E1, E2, E4a) | ✅   | [`bon-de-livraison.md`](bon-de-livraison.md)                                                                                                               |
| Le BL imprimé, chiffré ou non selon le lecteur (E5a)                                           | ✅   | [`bon-de-livraison.md`](bon-de-livraison.md)                                                                                                               |
| « Confirmation de commande » dans les libellés (E5b)                                           | ✅   | [`bon-et-pieces/architecture-bon-de-commande.md`](bon-et-pieces/architecture-bon-de-commande.md)                                                           |
| Le départ incomplet : signal, décision, BL partiel, montants (E6a, E6b, E6c1)                  | ✅   | [`bon-de-livraison.md`](bon-de-livraison.md)                                                                                                               |
| La facture et le prélèvement lisent les montants facturables, le gel (E6c2)                    | ✅   | [`bon-de-livraison.md`](bon-de-livraison.md), runbook « Avant de déployer E6c2 »                                                                           |
| Écrire au client après un départ incomplet (E6d)                                               | ✅   | [`bon-de-livraison.md`](bon-de-livraison.md)                                                                                                               |
| Les commandes de test passent par la vraie passation (lot T)                                   | ✅   | [`plan-t-commandes-de-test-par-le-vrai-chemin.md`](plan-t-commandes-de-test-par-le-vrai-chemin.md)                                                         |
| Le reliquat : « reste à relivrer », BL-2, le retrait par BL (E3 + E7)                          | 🟧   | [`plan-e7-le-reliquat.md`](plan-e7-le-reliquat.md), [`e7-recensement.md`](e7-recensement.md), [`plan-e7-1-le-jour-du-bon.md`](plan-e7-1-le-jour-du-bon.md) |
| « Commandé / livré / reste » sur le BL et les écrans                                           | 🟧   | [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md), lot E5                                                           |
| Solder : abandonner un reste après coup, `fulfilled` au solde (E8)                             | 🟧   | [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md)                                                                   |
| Rembourser un reste payé par carte, donc le départ incomplet par carte (E9)                    | 🟧   | [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md)                                                                   |
| Annuler, modifier après l'arrêt du plan, par décision (A1, A2)                                 | 🟧   | [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md) § 11.2                                                            |
| L'arrêt du plan comme une publication, avec des ajustements après coup                         | 🟧   | étude prévue, pas encore écrite                                                                                                                            |
| Réception avec réserve, avoir (R1, R2) ; vente hors plan nommée, statuts morts (H1, H2)        | 🟧   | [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md) § 11.3, § 11.4                                                    |
| Un particulier annule après l'arrêt du plan (C7)                                               | 🟧   | [`annulation/plan-annulation-apres-production.md`](annulation/plan-annulation-apres-production.md)                                                         |
