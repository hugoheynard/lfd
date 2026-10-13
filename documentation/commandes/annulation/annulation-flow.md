# L'annulation d'une commande, en un schéma

> **État au 2026-10-13** : tout ce qui suit est bâti et en production (lots C3,
> C3b, C5 et C4). Le détail et les raisons sont dans
> [`plan-annulation-de-commande.md`](plan-annulation-de-commande.md) ; l'ordre
> des verrous dans [`verrous-de-l-annulation.md`](verrous-de-l-annulation.md).

> 📐 **Décidé, PAS bâti : lot C6, l'annulation par le client** (Hugo,
> 2026-10-13 — [plan, Lot C6](plan-annulation-de-commande.md#lot-c6--annulation-par-le-client-depuis--mes-commandes--conçu-le-2026-10-13-pas-bâti)).
> Rien de la section « Demain » ci-dessous n'existe dans le code.

Aujourd'hui, **seul le staff annule**, depuis le détail d'une commande au
back-office, avec la permission « Annuler une commande ». Le client ne peut
pas encore annuler depuis « Mes commandes ».

## Selon le client

Le parcours est le même pour tous : ce qui change, c'est **comment le client
règle**, et ça dépend de qui il est.

```mermaid
flowchart LR
    PRO[Pro<br/>connecté, avec société] --> CPRO{Règlement}
    CPRO --> AC[au compte]
    CPRO --> CA[carte]
    STAFF[Saisie par l'équipe<br/>pour un pro] --> CPRO
    PART[Particulier<br/>connecté] --> CA
    INV[Invité<br/>non connecté] --> CA
    PART -. "total nul" .-> Z[0 €]
    INV -. "total nul" .-> Z
    PRO -. "total nul" .-> Z
```

| Client                                       | Comment il règle                                 | Ce que l'annulation fait de l'argent                                                     | Où part le courriel                            |
| -------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Pro**, connecté                            | au compte, ou carte                              | au compte : la ligne de prélèvement est fermée ; carte : paiement fermé ou remboursement | son adresse de compte                          |
| **Commande saisie par l'équipe** pour un pro | au compte si la société a du crédit, sinon carte | comme un pro                                                                             | l'adresse du compte du pro, pas celle du staff |
| **Particulier**, connecté                    | carte, toujours (jamais au compte)               | paiement fermé, ou remboursement                                                         | son adresse de compte                          |
| **Invité**, non connecté                     | carte, toujours                                  | paiement fermé, ou remboursement                                                         | l'adresse tapée au panier                      |
| N'importe lequel, **total à 0 €**            | rien à régler (bon ou geste)                     | aucun argent ; le bon est rendu                                                          | comme ci-dessus                                |

Deux précisions :

- **Le pro qui abandonne lui-même son panier** garde son paiement ouvert, pour
  pouvoir payer plus tard. **L'annulation par le staff, elle, ferme le paiement
  pour tout le monde**, pro compris.
- **Personne n'annule soi-même pour l'instant** : ni le pro, ni le particulier,
  ni l'invité. C'est toujours le staff, quel que soit le client. L'annulation
  depuis « Mes commandes » est un lot à venir.

## Le parcours

On lit de haut en bas. Les cases rouges sont des refus : l'écran affiche la
raison avant même le clic, et rien n'est écrit.

```mermaid
flowchart TD
    A(["Le staff clique « Annuler la commande »<br/>et donne un motif"]) --> B{"A-t-il la permission<br/>« Annuler une commande » ?"}
    B -- non --> R0["Le bouton n'apparaît pas"]:::refus
    B -- oui --> C{"La commande est-elle<br/>encore « passée » ?"}
    C -- "prête, retirée,<br/>déjà annulée" --> R1["Refus : trop tard"]:::refus
    C -- oui --> D{"Le fournil l'a-t-il déjà<br/>mise au compte à produire ?<br/>— journée arrêtée —"}
    D -- oui --> R2["Refus : déjà au compte à produire"]:::refus
    D -- non --> E{"Comment est-elle réglée ?"}

    E -- "carte, pas encore payée" --> F1["On ferme le paiement chez Stripe"]
    F1 --> F2{"Stripe a-t-il<br/>encaissé entre-temps ?"}
    F2 -- oui --> R3["Refus : payée à l'instant, rechargez"]:::refus
    F2 -- non --> OK

    E -- "carte, payée" --> G1["On annule, et on enregistre<br/>une demande de remboursement"]
    G1 --> OK

    E -- "au compte, pro" --> H1{"Déjà facturée, dans un lot<br/>de prélèvement, ou rejetée<br/>par la banque ?"}
    H1 -- oui --> R4["Refus nommé :<br/>il faut un avoir,<br/>ou annuler le lot"]:::refus
    H1 -- non --> H2["On ferme sa ligne de prélèvement :<br/>rien ne sera facturé ni prélevé"]
    H2 --> OK

    E -- "0 €, bon de fidélité<br/>ou geste commercial" --> OK

    OK[["La commande passe « annulée »<br/>et sort du compte à produire"]] --> V{"Portait-elle un bon<br/>de fidélité ?"}
    V -- non --> M
    V -- oui --> V1["Le bon est rendu,<br/>voir plus bas"]
    V1 --> M
    M(["Courriel au client<br/>et ligne dans l'historique"]) --> P{"Payée par carte ?"}
    P -- non --> FIN(["Terminé"])
    P -- oui --> S["Stripe rembourse,<br/>juste après"]
    S --> FIN

    classDef refus fill:#fde8e8,stroke:#c0392b,color:#7b1d1d
```

## Le bon de fidélité

Quand la commande portait un bon, l'annulation le rend au client. Si le bon
avait laissé un **reste** (un nouveau bon pour la différence), ce reste est
**refondu** dans le bon d'origine. Le staff lit ce qui va se passer avant de
confirmer.

```mermaid
flowchart TD
    A{Le bon a-t-il laissé<br/>un reste ?} -- non --> B[Le bon est rendu entier]
    A -- oui --> C{Le reste a-t-il<br/>déjà servi ?}
    C -- "oui, sur une autre commande" --> R1[Refus : la phrase nomme<br/>cette autre commande]:::refus
    C -- "annulé par l'équipe" --> R2[Refus : l'annulation<br/>n'est plus possible]:::refus
    C -- non --> D[Le reste est annulé<br/>et le bon d'origine revient<br/>à sa valeur et sa date limite]
    B --> E{Le bon est-il<br/>arrivé à échéance ?}
    D --> E
    E -- oui --> F[Il n'est pas rendu,<br/>le courriel n'en parle pas]
    E -- non --> G[Le client retrouve son bon]

    classDef refus fill:#fde8e8,stroke:#c0392b,color:#7b1d1d
```

Aucun point de fidélité n'est recrédité : le bon a déjà été payé en points.

## Le remboursement d'une commande payée

L'annulation est écrite **d'abord**, la demande de remboursement avec elle.
Stripe est appelé **ensuite**, parce qu'un remboursement parti ne se reprend
pas.

```mermaid
sequenceDiagram
    autonumber
    participant S as Staff
    participant B as Base de données
    participant X as Stripe

    S->>B: Annuler
    B->>B: commande annulée + demande de remboursement<br/>(une seule opération)
    B-->>S: OK — le détail affiche « remboursement en cours »
    B->>X: Rembourser le reste payé par carte
    alt Stripe accepte
        X-->>B: remboursement créé
        B-->>S: le bandeau passe à « remboursé »
    else Stripe ne répond pas
        Note over B,X: une tâche régulière relance,<br/>sans jamais rembourser deux fois
    else Stripe refuse
        B-->>S: alerte + bouton « Relancer »
    end
```

Ce qui est rendu : **tout ce qui a été payé par carte**, livraison et frais de
retard compris. Ce qui a été payé avec un bon n'est jamais rendu en argent :
c'est le bon qui revient.

## Ce que le client reçoit

| La commande était…      | Le courriel dit                                             |
| ----------------------- | ----------------------------------------------------------- |
| carte, pas encore payée | qu'aucun paiement n'a été prélevé                           |
| carte, payée            | que le remboursement est en cours                           |
| au compte               | « Rien ne sera facturé ni prélevé pour cette commande. »    |
| avec un bon             | que son bon lui est rendu (sauf s'il est arrivé à échéance) |

Le **motif** saisi par le staff reste au journal : il n'est jamais montré au
client.

## Demain : le client annule lui-même (lot C6, décidé, pas bâti)

> 📐 **Pas bâti au 2026-10-13.** Mêmes règles que le staff : le client passe
> par le même noyau, avec moins de droits, jamais plus.

| Client          | Qui peut annuler                                             | Quand                                                                              | Comment il s'identifie                                                        |
| --------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Pro**         | tout membre **accepté** de **cette** société, société active | tant que le fournil ne l'a pas mise au compte à produire                           | sa session, depuis « Mes commandes »                                          |
| **Particulier** | l'auteur                                                     | si Réglages › Commandes l'autorise, jusqu'à N h avant, et pas au compte à produire | sa session, depuis « Mes commandes »                                          |
| **Invité**      | le porteur du lien                                           | comme le particulier                                                               | le lien d'annulation de son courriel de confirmation (s'il n'a pas de compte) |

```mermaid
flowchart TD
    A([Le client clique « Annuler la commande »]) --> W{Est-il autorisé ?<br/>membre de la société,<br/>auteur, ou lien valide}
    W -- non --> R0["Commande introuvable"]:::refus
    W -- oui --> K{Commande personnelle ?}
    K -- "non (pro)" --> N
    K -- oui --> S{Réglage ouvert ?}
    S -- non --> R1["Refus : contactez-nous"]:::refus
    S -- oui --> T{Plus de N heures<br/>avant le retrait / la livraison ?}
    T -- non --> R2["Refus : trop tard, c'était possible jusqu'au…"]:::refus
    T -- oui --> N[["Même parcours que le staff<br/>(fournil, argent, bon)"]]
    N --> M([Même courriel, cloche à l'équipe])

    classDef refus fill:#fde8e8,stroke:#c0392b,color:#7b1d1d
```

Le lien de l'invité ouvre **toujours** la page de sa commande. Si elle n'est
plus annulable, la page dit pourquoi (annulations en ligne fermées, délai
passé, déjà en production, déjà annulée, déjà retirée) et propose de
contacter la boutique ; le lien ne montre plus rien 90 jours après la date de
retrait. La page ne montre que le nécessaire : ni nom de famille, ni adresse,
ni téléphone. Quand elle est annulable, elle demande de confirmer : jamais
d'annulation à la simple ouverture, parce que les messageries suivent les
liens toutes seules. Les commandes passées avant C6 n'ont pas de lien : rien
n'est rétroactif. Le lien ne contient rien que le serveur garde : il se
recalcule, et un courriel renvoyé porte le même.
