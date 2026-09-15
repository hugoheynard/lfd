# La RUM — la référence unique de mandat

La **RUM** est la chaîne qui désigne un mandat de prélèvement. Le débiteur la
déclare à sa banque avec notre ICS, elle est imprimée sur le papier qu'il signe,
et chaque prélèvement la porte jusqu'à son relevé.

Le contexte du prélèvement — schémas, lot, cycle — est dans
[`prelevement-sepa.md`](prelevement-sepa.md) ; les sigles dans
[`lexique.md`](lexique.md).

---

## 1. Ce qu'elle est

**Un identifiant, pas un secret.** Elle est imprimée, dictée au téléphone, lue
sur un relevé. On lui demande d'être **unique**, **non énumérable** et **muette
sur nos affaires** — pas d'être cachée.

**C'est nous qui la frappons.** Elle naît avec le mandat, **avant**
l'impression : c'est elle qui fait d'un exemplaire marqué « EXEMPLE » un
document signable. La RUM et la disparition du filigrane sont commandées par un
seul paramètre du rendu, donc impossibles à découpler.

**Elle est immuable.** La réécrire invaliderait le papier qui la porte.

## 2. Où elle vit

| Étape    | Où                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frappe   | `Rum.mint` — [`rum.ts`](../../apps/lfd-api/src/b2b/payments/domain/value-objects/rum.ts), appelé par `mint-mandate-support.ts`                      |
| Routes   | `POST /admin/companies/:companyId/mandate` (staff), `POST /companies/:companyId/mandate` (client)                                                   |
| Stockage | `payment_mandates.reference`, sur un mandat à l'état `draft`                                                                                        |
| Unicité  | une RUM par créancier (`payment_mandates_reference_unique_per_creditor`) ; un seul brouillon par société (`payment_mandates_one_draft_per_company`) |
| Papier   | le peigne de la référence : 26 cases sur le mandat CORE, 35 sur le mandat interentreprises                                                          |
| Lot      | `MndtRltdInf/MndtId` du `pain.008`, pour le mandat actif de chaque débiteur                                                                         |

## 3. Sa forme

**`LFC` + le code du client + la date de frappe + six symboles tirés au sort.**

```
LFC-9P2X4B-260912-K7M3QT
 │     │       │      └── 6 symboles du SecretGenerator — la part imprévisible
 │     │       └───────── YYMMDD à Europe/Paris — la date de FRAPPE
 │     └───────────────── le code de Company.reference, sans son « C- »
 └─────────────────────── notre préfixe
```

|          | valeur                                                   |
| -------- | -------------------------------------------------------- |
| longueur | **24** caractères                                        |
| alphabet | Crockford base32, sans `I`, `L`, `O` ni `U`, plus le `-` |
| entropie | **~60 bits** — 30 du code client, 30 du tirage           |

### Pourquoi une forme lisible

Un client qui appelle n'a souvent qu'une information : la ligne de son relevé.
Une référence structurée dit tout de suite **qui** et **quand** ; une référence
opaque impose une recherche avant de pouvoir répondre.

### Ce que la forme laisse voir, et pourquoi c'est accepté

Deux RUM comparées révèlent l'ordre et l'écart de leurs dates de frappe. Le prix
est payé sciemment : la date sert le support tous les jours, et un client ne
voit jamais que **sa** RUM — comparer deux références suppose deux clients qui
se les montrent.

### Pourquoi le code client ne l'affaiblit pas

`Company.reference` **n'est pas un compteur** : `platform/id/reference.ts` la
dérive de la queue d'un ULID, soit 30 bits d'aléa. Elle ne révèle ni le nombre de
clients ni leur ordre d'arrivée, et la RUM reste hors de portée d'une
énumération.

🔴 C'est la seule hypothèse que la frappe fait sur un autre contexte : si cette
référence devenait séquentielle, la forme serait à revoir.

### La date est celle de la FRAPPE

La RUM existe avant l'impression, et le client signe des jours plus tard. La date
de **signature** est portée par le mandat (`accepted_at`), jamais par la RUM :
lire l'estampille comme une date de consentement serait une erreur.

### Le fuseau

L'estampille se lit à **`Europe/Paris`**. Un mandat frappé à 00 h 30 à Paris
tombe la veille en UTC : la référence imprimée contredirait la date affichée à
l'écran le même soir. Deux tests le tiennent, un par saison.

## 4. Les bornes

| Contrainte                              | Valeur                                                              | Source                                                        |
| --------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| longueur, à la frappe (`Rum.mint`)      | **26**                                                              | le peigne du mandat CORE, le plus étroit des deux formulaires |
| longueur, à la relecture (`Rum.create`) | **35**                                                              | la norme EPC                                                  |
| jeu de caractères                       | lettres non accentuées, chiffres, `/ - ? : ( ) . , ' +` et l'espace | le jeu **SEPA restreint**                                     |

**La frappe est bornée par le papier, pas par la norme.** Un peigne se remplit
case par case ; une RUM plus longue que ses cases sortirait tronquée sur le
papier signé pendant que la base garderait l'intégralité. Le rendu **refuse**
une référence qui déborde plutôt que de la couper, et la frappe ne produit
jamais une référence plus longue que le peigne le plus étroit.

**La relecture est plus permissive que la frappe.** Une référence en base n'a pas
forcément été frappée ici : une reprise de portefeuille en apporterait d'autres.
Resserrer `Rum.create` sur 26 ferait échouer la relecture d'un mandat valide.

**Le jeu restreint n'est pas une préférence.** Un accent dans une référence fait
rejeter le **fichier entier** par la banque, pas la seule ligne.

## 5. Les références qui ne viennent pas de nous

`Rum.create` relit une RUM **tierce** — reprise de portefeuille, fichier de
retour. Aucun import de ce genre n'existe aujourd'hui : `Rum.create` n'a pas
d'appelant, et seul `Rum.mint` produit des références.

L'index d'unicité couvre pourtant déjà ce cas : une garantie qui ne porterait que
sur ce qu'on fabrique ne couvrirait pas ce qu'on reçoit.
