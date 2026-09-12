# `pain.008` — le fichier qu'on dépose à la banque

Le message ISO 20022 qui **demande les prélèvements**. C'est lui qu'on déposera
chaque mois dans le portail de la Caisse d'Épargne, et c'est la seule pièce du
système dont une erreur se paie en argent réel plutôt qu'en écran faux.

> **Note de travail, écrite le 2026-09-10.** Elle sert à deux choses : préparer
> le code, et **préparer l'entretien avec la banque**. Sa dernière section est la
> liste des questions à poser — aucune ne se répond depuis le dépôt.

## 🔴 « Universel » n'existe pas

Le socle commun est `pain.008.001.02`, dans la déclinaison des _Implementation
Guidelines_ de l'EPC. Toutes les banques de la zone l'acceptent.

Mais **chacune publie son propre guide d'implémentation par-dessus** : champs
exigés là où la norme les dit optionnels, taille de lot, nommage du fichier,
canal de dépôt. Le guide de la Caisse d'Épargne fait foi, pas ce document. Tant
qu'on ne l'a pas, tout ce qui suit est une **hypothèse instruite**.

## La structure, en trois niveaux

```
CstmrDrctDbtInitn
├── GrpHdr                     le message     — un par fichier
└── PmtInf                     LE LOT         — un par (SeqTp, ReqdColltnDt)
    └── DrctDbtTxInf           une ligne      — un par DÉBITEUR chez nous
```

⚠️ **Un `DrctDbtTxInf` par débiteur, pas par commande.** C'est la décision du
2026-09-10 (§0 quater) : un client à trente commandes voit **une** ligne sur son
relevé et nous payons **un** frais d'opération. Les trente commandes se résument
dans `RmtInf/Ustrd`, borné à 140 caractères — donc « Commandes du … au … », pas
une liste.

## Ce que nous savons déjà remplir, et ce qui manque

Relevé dans le dépôt le 2026-09-10.

| Champ XML                    | Notre source                                  | État                                     |
| ---------------------------- | --------------------------------------------- | ---------------------------------------- |
| `Cdtr/Nm`                    | `CreditorSnapshot.name`                       | ✅ livré                                 |
| `CdtrAcct/Id/IBAN`           | `LegalEntity.creditorIban`                    | ✅ livré, validé mod-97                  |
| `CdtrSchmeId/…/Othr/Id`      | `LegalEntity.ics`                             | ✅ livré, immuable                       |
| `MndtRltdInf/MndtId`         | value object `Rum` (`LFC` + ULID, 29 car.)    | 🟡 **écrit, branché à rien**             |
| `ReqdColltnDt`               | le cycle + `preNotificationDays`              | 🟡 cycle livré, la date reste à arbitrer |
| `InstdAmt`                   | somme des `orders.total_cents` du cycle       | 🟡 assiette décidée, non codée           |
| `EndToEndId`                 | à frapper — cycle + société + n° de tentative | ❌ à concevoir                           |
| **`CdtrAgt/FinInstnId/BIC`** | —                                             | 🔴 **AUCUNE source**                     |
| `Dbtr/Nm`                    | `Company` (raison sociale)                    | ✅ existe                                |
| **`DbtrAcct/Id/IBAN`**       | —                                             | 🔴 **AUCUNE source**                     |
| `DbtrAgt/FinInstnId/BIC`     | —                                             | 🔴 aucune, mais souvent facultatif       |
| `MndtRltdInf/DtOfSgntr`      | `PaymentMandate.acceptedAt`                   | ✅ existe                                |

### Les deux trous rouges ne se valent pas

**Le BIC créancier est trivial** : c'est celui de notre propre banque, il ne
change jamais, et il se saisit une fois sur l'entité émettrice — au même endroit
que l'IBAN, dont il se déduit d'ailleurs. Une colonne de plus, rien de conceptuel.

🔴 **L'IBAN du débiteur, lui, n'existe nulle part et ne peut pas être récupéré.**
Le mandat Stripe ne porte que `last4`, `bankCode` et `country` — de quoi
RECONNAÎTRE un compte, jamais de quoi le débiter. C'était le point de la §4 :
Stripe détenait les coordonnées, nous non. **Le portefeuille de mandats existant
est donc inexploitable pour un `pain.008`**, quel qu'en soit le format.

C'est ce que la tranche 2 apporte : le coffre à IBAN, et des mandats signés en
direct. Aucun fichier ne peut sortir avant elle.

## Le squelette

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>CRZ-2026-09-001</MsgId>
      <CreDtTm>2026-09-30T23:05:00</CreDtTm>
      <NbOfTxs>2</NbOfTxs>
      <CtrlSum>1234.56</CtrlSum>
      <InitgPty><Nm>CRAZEATIVITY</Nm></InitgPty>
    </GrpHdr>

    <PmtInf>
      <PmtInfId>CRZ-2026-09-001-RCUR</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>2</NbOfTxs>
      <CtrlSum>1234.56</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>B2B</Cd></LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>2026-10-15</ReqdColltnDt>
      <Cdtr><Nm>CRAZEATIVITY</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>FR76…</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><BIC>…</BIC></FinInstnId></CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr>
        <Id>FR00ZZZ900001</Id>
        <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
      </Othr></PrvtId></Id></CdtrSchmeId>

      <DrctDbtTxInf>
        <PmtId><EndToEndId>CRZ-2026-09-TOMMEUSES-1</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">617.28</InstdAmt>
        <DrctDbtTx><MndtRltdInf>
          <MndtId>LFC01JBXY7Z9K4M2N8P3Q5R7S9T1V</MndtId>
          <DtOfSgntr>2026-07-04</DtOfSgntr>
          <AmdmntInd>false</AmdmntInd>
        </MndtRltdInf></DrctDbtTx>
        <DbtrAgt><FinInstnId><BIC>…</BIC></FinInstnId></DbtrAgt>
        <Dbtr><Nm>SAS LES TOMMEUSES</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>FR76…</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>Commandes du 01/09 au 30/09/2026</Ustrd></RmtInf>
      </DrctDbtTxInf>
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>
```

## Les pièges qui font rejeter un fichier

🔴 **Un `PmtInf` par couple (`SeqTp`, `ReqdColltnDt`).** Le piège classique. Si
trois clients sont en `FRST` et quarante en `RCUR`, ou si deux dates de règlement
coexistent, il faut **plusieurs blocs**. Un seul bloc mélangé se fait rejeter en
masse — et « en masse » veut dire : aucun des quarante-trois n'est prélevé.

**`CreDtTm` sans décalage horaire.** `2026-09-30T23:05:00`, ni `Z` ni `+02:00`.
Beaucoup de banques françaises refusent l'offset.

⚠️ Attention à l'articulation avec notre cycle, qui lui est en instants UTC
bornés à minuit **local** : la conversion se fait à l'écriture du fichier, et
c'est un endroit de plus où une lecture UTC ferait un fichier d'un autre jour.

**`NbOfTxs` et `CtrlSum` doivent tomber juste aux DEUX niveaux**, point décimal,
deux décimales. Un centime d'écart rejette le message entier.

**Jeu de caractères SEPA restreint** — aucun accent. « Val d'Isère » devient
« Val d Isere ». C'est le même jeu que `Rum` applique déjà.

**35 caractères** pour `MndtId` et `EndToEndId`. Notre RUM en fait 29 ; il reste
six caractères, ce qui n'est pas beaucoup pour un `EndToEndId` qui doit porter le
cycle, la société et le numéro de tentative. **À vérifier avant de figer le
format**, sinon la re-présentation devient intraçable dans le fichier de retour.

**Le BIC du débiteur est facultatif** dans la zone SEPA depuis 2016
(`<Othr><Id>NOTPROVIDED</Id></Othr>`). Certaines banques l'exigent quand même.

## 🔴 Les questions pour la Caisse d'Épargne

Aucune ne se répond depuis le dépôt. Toutes bloquent du code.

1. **Quelle version** le portail accepte-t-il — `pain.008.001.02`, ou le
   `pain.008.001.08` du rulebook 2023 ? Et jusqu'à quand la première ?
2. **Votre guide d'implémentation** : quels champs exigez-vous que la norme dit
   optionnels ? Le BIC débiteur en particulier.
3. **Le délai de présentation** en SDD B2B : combien de jours ouvrés avant
   `ReqdColltnDt` le fichier doit-il être déposé ?
4. **`FRST` ou `RCUR`** pour un premier prélèvement sous un mandat neuf : exigez-
   vous encore la distinction, ou acceptez-vous `RCUR` partout ?
5. **Le dépôt** : quel canal, quel nommage de fichier, quelle taille maximale de
   lot, et **comment sait-on qu'il est arrivé** ?
6. **Les retours** : `pain.002` et/ou `camt.054` ? Sous quel délai, et par quel
   canal les récupère-t-on ?
7. **Notre BIC créancier**, tout simplement.
8. **Le délai de pré-notification** : 14 jours est-il contractualisable au
   mandat, ou imposé ?

⚠️ Les questions 3 et 8 **décident ensemble** de trois phrases actuellement
incompatibles dans le plan : « export au dernier jour du mois » (§6), « clôture
le 1er » (Hugo), et « débit au plus tôt à J + `preNotificationDays` » (§5).

## Ce que ce document n'a PAS vérifié

- **Tout le droit SEPA cité ici** vient de la norme telle que je la connais, pas
  d'un guide en main : délais, caducité à 36 mois, obligation de
  pré-notification, facultativité du BIC. Chaque point est à confirmer.
- **Le guide de la Caisse d'Épargne**, qui n'a pas été lu.
- **L'état du portefeuille en production.** Le plan note qu'aucun mandat n'y
  existe à ce jour ; ce document ne l'a pas recompté.
