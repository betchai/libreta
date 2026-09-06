export default function Disclaimer() {
    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 space-y-1">
            <p><b>BIR Compliance Note:</b> These reports are prepared as source documents to assist BIR filing —
            please have your accountant or authorized tax preparer review and file the official BIR forms
            (2550Q, 2551Q, 1701Q / 1701 / 1701A, 0619-E, 1601-EQ, 1604-E) through eBIRForms/ORUS.</p>
            <p className="text-xs">Deadlines follow the Ease of Paying Taxes Act (RA 11976): no annual registration fee (Form 0605) is due;
            monthly VAT (2550M) is optional; creditable WHT is withheld when income becomes payable; and a manual
            ARF is not applicable. Verify your COR (2303) tax types and current RMC issuances each year.</p>
        </div>
    )
}