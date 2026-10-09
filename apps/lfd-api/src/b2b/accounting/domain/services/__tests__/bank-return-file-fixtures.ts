/**
 * Des fichiers de retours écrits d'après la norme ISO 20022 — `pain.002.001.03`
 * et `camt.054.001.02`, les versions les plus courantes en France. Aucun n'a
 * été comparé à un vrai fichier de la Caisse d'Épargne : à éprouver dès qu'on
 * en aura un (plan `plan-retours-bancaires.md`, R5b).
 */

export interface FixtureTransaction {
  readonly endToEndId: string;
  /** `"123.45"` — comme la banque l'écrit. */
  readonly amount: string;
  readonly code?: string;
  readonly proprietary?: string;
  readonly additional?: string;
}

/** Un rapport de statut `pain.002.001.03` : chaque transaction rejetée (`RJCT`). */
export function pain002(day: string, transactions: readonly FixtureTransaction[]): string {
  const txs = transactions
    .map(
      (tx, index) => `
      <TxInfAndSts>
        <StsId>STS-${index + 1}</StsId>
        <OrgnlEndToEndId>${tx.endToEndId}</OrgnlEndToEndId>
        <TxSts>RJCT</TxSts>
        <StsRsnInf>
          <Orgtr><Nm>CAISSE D&apos;EPARGNE</Nm></Orgtr>
          <Rsn>${reason(tx)}</Rsn>
          ${tx.additional === undefined ? "" : `<AddtlInf>${tx.additional}</AddtlInf>`}
        </StsRsnInf>
        <OrgnlTxRef>
          <Amt><InstdAmt Ccy="EUR">${tx.amount}</InstdAmt></Amt>
          <ReqdColltnDt>${day}</ReqdColltnDt>
        </OrgnlTxRef>
      </TxInfAndSts>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrPmtStsRpt>
    <GrpHdr>
      <MsgId>PSR-0001</MsgId>
      <CreDtTm>${day}T07:30:00</CreDtTm>
    </GrpHdr>
    <OrgnlGrpInfAndSts>
      <OrgnlMsgId>LOT-0001</OrgnlMsgId>
      <OrgnlMsgNmId>pain.008.001.02</OrgnlMsgNmId>
      <GrpSts>PART</GrpSts>
    </OrgnlGrpInfAndSts>
    <OrgnlPmtInfAndSts>
      <OrgnlPmtInfId>PMT-0001</OrgnlPmtInfId>
      <TxInfAndSts>
        <StsId>STS-OK</StsId>
        <OrgnlEndToEndId>ACCEPTED-1</OrgnlEndToEndId>
        <TxSts>ACCP</TxSts>
      </TxInfAndSts>${txs}
    </OrgnlPmtInfAndSts>
  </CstmrPmtStsRpt>
</Document>`;
}

/** Une notification `camt.054.001.02` : une écriture de retour par transaction. */
export function camt054(day: string, transactions: readonly FixtureTransaction[]): string {
  const entries = transactions
    .map(
      (tx) => `
      <Ntry>
        <Amt Ccy="EUR">${tx.amount}</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <RvslInd>true</RvslInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>${day}</Dt></BookgDt>
        <ValDt><Dt>${day}</Dt></ValDt>
        <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>RDDT</Cd><SubFmlyCd>UPDD</SubFmlyCd></Fmly></Domn></BkTxCd>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>${tx.endToEndId}</EndToEndId></Refs>
            <AmtDtls><TxAmt><Amt Ccy="EUR">${tx.amount}</Amt></TxAmt></AmtDtls>
            <RtrInf>
              <Rsn>${reason(tx)}</Rsn>
              ${tx.additional === undefined ? "" : `<AddtlInf>${tx.additional}</AddtlInf>`}
            </RtrInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.02">
  <BkToCstmrDbtCdtNtfctn>
    <GrpHdr>
      <MsgId>NTF-0001</MsgId>
      <CreDtTm>${day}T06:00:00</CreDtTm>
    </GrpHdr>
    <Ntfctn>
      <Id>NTF-0001-1</Id>
      <CreDtTm>${day}T06:00:00</CreDtTm>
      <Acct><Id><IBAN>FR7630001007941234567890185</IBAN></Id></Acct>${entries}
      <Ntry>
        <Amt Ccy="EUR">10.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>${day}</Dt></BookgDt>
        <NtryDtls><TxDtls><Refs><EndToEndId>NOT-A-RETURN</EndToEndId></Refs></TxDtls></NtryDtls>
      </Ntry>
    </Ntfctn>
  </BkToCstmrDbtCdtNtfctn>
</Document>`;
}

function reason(tx: FixtureTransaction): string {
  return tx.proprietary === undefined
    ? `<Cd>${tx.code ?? "AM04"}</Cd>`
    : `<Prtry>${tx.proprietary}</Prtry>`;
}
