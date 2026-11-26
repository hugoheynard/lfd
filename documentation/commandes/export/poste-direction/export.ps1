<#
.SYNOPSIS
    Va chercher les ventes de La Folie Douce et les range dans « Documents\Ventes LFD ».

.DESCRIPTION
    Appelle l'export des ventes (GET /api/lfd/exports/sales) sur les 15 derniers
    jours (jour de Paris, bornes incluses), et le mois précédent en entier une fois
    par mois. Range la réponse brute dans archives\, met à jour la base cumulée
    base\ventes.json (chaque commande reçue remplace la commande et TOUTES ses
    lignes, par son numéro), puis régénère ventes.js, les CSV et une ligne de
    export.log.

    Un échec (réseau, clé refusée, limite atteinte, période refusée) s'arrête
    AVANT d'écrire la base : la page garde les chiffres de la veille, et une
    notification Windows nomme la cause.

    La clé est chiffrée par Windows (DPAPI) pour ce compte et ce poste, dans
    %LOCALAPPDATA%\LFD\export-key.xml. Elle n'est jamais affichée ni journalisée.

    Écrit pour Windows PowerShell 5.1 (celui de Windows 10 et 11).

.PARAMETER NouvelleCle
    Demande la clé et la range (remplace l'ancienne), puis s'arrête.

.PARAMETER Planifier
    Crée la tâche planifiée quotidienne à l'heure dite (HH:mm), puis s'arrête.

.PARAMETER Deplanifier
    Retire la tâche planifiée, puis s'arrête.

.PARAMETER Url
    L'adresse de la passerelle (sans chemin). Défaut : la production.

.PARAMETER Dossier
    Le dossier des ventes. Défaut : Documents\Ventes LFD.

.EXAMPLE
    .\export.ps1                    # premier lancement : demande la clé, puis exporte
    .\export.ps1 -Planifier 07:00   # tous les jours à 7 h
#>
[CmdletBinding()]
param(
    [switch] $NouvelleCle,
    [string] $Planifier,
    [switch] $Deplanifier,
    [string] $Url = 'https://lfd-gateway.lafoliedouce.workers.dev',
    [string] $Dossier = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Ventes LFD'),
    # Posé par la tâche planifiée : sans fenêtre, on ne peut pas demander la clé.
    [switch] $Tache
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$TaskName = 'LFD - export des ventes'
$KeyPath = Join-Path $env:LOCALAPPDATA 'LFD\export-key.xml'
$RecentDays = 15
$ParisZone = [TimeZoneInfo]::FindSystemTimeZoneById('Romance Standard Time')
$French = New-Object System.Globalization.CultureInfo 'fr-FR'
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
$Utf8Bom = New-Object System.Text.UTF8Encoding $true

Add-Type -AssemblyName System.Web.Extensions
$Json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
# ConvertFrom-Json de PowerShell 5.1 refuse un texte de plus de 2 Mo : la base les dépassera.
$Json.MaxJsonLength = [int]::MaxValue

# ---------------------------------------------------------------- échec nommé

function Stop-Export([string] $Cause) {
    throw (New-Object System.InvalidOperationException $Cause)
}

function Show-Notification([string] $Title, [string] $Text) {
    # Moyen intégré à Windows : une bulle de la zone de notification (System.Windows.Forms).
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $icon = New-Object System.Windows.Forms.NotifyIcon
        $icon.Icon = [System.Drawing.SystemIcons]::Warning
        $icon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Error
        $icon.BalloonTipTitle = $Title
        if ($Text.Length -gt 250) { $Text = $Text.Substring(0, 250) }
        $icon.BalloonTipText = $Text
        $icon.Visible = $true
        $icon.ShowBalloonTip(15000)
        Start-Sleep -Seconds 15
        $icon.Dispose()
    } catch {
        Write-Warning "Notification impossible : $($_.Exception.Message)"
    }
}

function Write-ExportLog([string] $Line) {
    if (-not (Test-Path -LiteralPath $Dossier)) { New-Item -ItemType Directory -Path $Dossier | Out-Null }
    $stamp = (Get-ParisNow).ToString('yyyy-MM-dd HH:mm:ss')
    [System.IO.File]::AppendAllText((Join-Path $Dossier 'export.log'), "$stamp $Line`r`n", $Utf8Bom)
}

# ---------------------------------------------------------------- temps de Paris

function Get-ParisNow {
    return [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $ParisZone)
}

function Format-Day([DateTime] $Day) {
    return $Day.ToString('yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture)
}

# ---------------------------------------------------------------- la clé

function Save-Key {
    $secure = Read-Host -AsSecureString 'Collez la clé d''export (elle ne s''affiche pas), puis Entrée'
    if ($secure.Length -eq 0) { Stop-Export 'Aucune clé saisie : relancez export.ps1 -NouvelleCle et collez la clé montrée au back-office.' }
    $folder = Split-Path -Parent $KeyPath
    if (-not (Test-Path -LiteralPath $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
    $secure | Export-Clixml -LiteralPath $KeyPath
    Write-Host "Clé rangée, chiffrée par Windows pour ce compte, dans $KeyPath."
}

function Read-Key {
    if (-not (Test-Path -LiteralPath $KeyPath)) {
        if ($Tache) { Stop-Export 'Aucune clé sur ce poste : lancez export.ps1 -NouvelleCle à la main, une fois.' }
        Save-Key
    }
    try {
        $secure = Import-Clixml -LiteralPath $KeyPath
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    } catch {
        Stop-Export 'La clé rangée sur ce poste est illisible (autre compte Windows, ou fichier copié d''un autre poste) : lancez export.ps1 -NouvelleCle.'
    }
}

# ---------------------------------------------------------------- planification

function Register-ExportTask([string] $At) {
    $time = [DateTime]::MinValue
    if (-not [DateTime]::TryParseExact($At, 'HH:mm', [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref] $time)) {
        Stop-Export "« $At » n'est pas une heure HH:mm : écrivez par exemple -Planifier 07:00."
    }
    $script = $PSCommandPath
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -Tache -Url `"$Url`" -Dossier `"$Dossier`""
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -Daily -At $time
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    # Interactive : la tâche ne tourne que session ouverte — c'est ce qui donne accès à la clé (DPAPI).
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host "Tâche « $TaskName » planifiée tous les jours à $At (rattrapée à l'ouverture de session si le poste était éteint)."
}

function Unregister-ExportTask {
    if ($null -eq (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
        Write-Host "Aucune tâche « $TaskName » à retirer."
        return
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Tâche « $TaskName » retirée."
}

# ---------------------------------------------------------------- appel de l'API

function Get-ErrorMessage($ErrorRecord) {
    # L'API répond { code, message, requestId } ; la passerelle répond en texte.
    $raw = $null
    if ($null -ne $ErrorRecord.ErrorDetails) { $raw = $ErrorRecord.ErrorDetails.Message }
    if ([string]::IsNullOrEmpty($raw)) { return '' }
    try {
        $body = $Json.DeserializeObject($raw)
        if ($body -is [System.Collections.IDictionary] -and $body.ContainsKey('message')) { return [string] $body['message'] }
    } catch { }
    return $raw
}

function Invoke-Export([string] $Key, [string] $From, [string] $To) {
    $address = $Url.TrimEnd('/') + "/api/lfd/exports/sales?from=$From&to=$To"
    try {
        $response = Invoke-WebRequest -Uri $address -Headers @{ 'X-Export-Key' = $Key } -UseBasicParsing -TimeoutSec 120
    } catch [System.Net.WebException] {
        $webResponse = $_.Exception.Response
        if ($null -eq $webResponse) {
            Stop-Export "API injoignable ($($_.Exception.Status)) : vérifiez la connexion internet ; le script réessaiera au prochain lancement."
        }
        $status = [int] $webResponse.StatusCode
        $detail = Get-ErrorMessage $_
        if ($status -eq 401) { Stop-Export "Clé refusée (401) : $detail Lancez export.ps1 -NouvelleCle avec une clé neuve." }
        if ($status -eq 403) { Stop-Export "Accès refusé (403) : $detail" }
        if ($status -eq 429) { Stop-Export 'Limite d''appels atteinte (429) : attendez une minute puis relancez.' }
        if ($status -eq 400) { Stop-Export "Période refusée (400) : $detail" }
        Stop-Export "L'API a répondu $status : $detail Réessayez plus tard ; si cela dure, prévenez La Folie Douce."
    }
    $text = $Utf8NoBom.GetString($response.RawContentStream.ToArray())
    try { $data = $Json.DeserializeObject($text) }
    catch { Stop-Export "Réponse illisible de l'API pour la période du $From au $To : rien n'a été modifié, réessayez plus tard." }
    foreach ($part in @('orders', 'lines', 'creditNotes', 'summary')) {
        if (-not ($data -is [System.Collections.IDictionary]) -or -not $data.ContainsKey($part)) {
            Stop-Export "Réponse incomplète de l'API (pas de « $part ») : rien n'a été modifié, prévenez La Folie Douce."
        }
    }
    return New-Object PSObject -Property @{ From = $From; To = $To; Text = $text; Data = $data }
}

function Get-Periods($Base) {
    $today = (Get-ParisNow).Date
    $periods = New-Object System.Collections.Generic.List[object]
    $periods.Add(@((Format-Day $today.AddDays(1 - $RecentDays)), (Format-Day $today)))
    # Le mois précédent, une fois par mois : le 1er, ou au premier lancement qui suit s'il a été manqué.
    $firstOfMonth = New-Object DateTime $today.Year, $today.Month, 1
    $previousStart = $firstOfMonth.AddMonths(-1)
    $previousMonth = $previousStart.ToString('yyyy-MM')
    if ($Base['monthsReread'] -notcontains $previousMonth) {
        $periods.Add(@((Format-Day $previousStart), (Format-Day $firstOfMonth.AddDays(-1))))
    }
    return New-Object PSObject -Property @{ Periods = $periods; PreviousMonth = $previousMonth }
}

# ---------------------------------------------------------------- archive et base

function Save-Archive($Calls) {
    $folder = Join-Path $Dossier 'archives'
    if (-not (Test-Path -LiteralPath $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
    $day = Format-Day (Get-ParisNow)
    foreach ($call in $Calls) {
        $name = "$day.json"
        if ($call.From.Substring(0, 7) -ne $day.Substring(0, 7) -and $call.To.Substring(0, 7) -ne $day.Substring(0, 7)) {
            $name = "$day-mois-$($call.From.Substring(0, 7)).json"
        }
        $path = Join-Path $folder $name
        $n = 2
        while (Test-Path -LiteralPath $path) {
            $path = Join-Path $folder ($name -replace '\.json$', "-$n.json")
            $n++
        }
        [System.IO.File]::WriteAllText($path, $call.Text, $Utf8NoBom)
    }
}

function New-List($Items) {
    $list = New-Object System.Collections.Generic.List[object]
    if ($null -ne $Items) { foreach ($item in $Items) { $list.Add($item) } }
    return , $list
}

function Read-Base {
    $path = Join-Path $Dossier 'base\ventes.json'
    $base = @{ orders = (New-List $null); lines = (New-List $null); creditNotes = (New-List $null); summary = (New-List $null); monthsReread = (New-List $null) }
    if (-not (Test-Path -LiteralPath $path)) { return $base }
    try { $stored = $Json.DeserializeObject([System.IO.File]::ReadAllText($path, $Utf8NoBom)) }
    catch { Stop-Export "La base $path est illisible : restaurez-la depuis une sauvegarde (rien n'a été modifié)." }
    foreach ($part in @('orders', 'lines', 'creditNotes', 'summary', 'monthsReread')) {
        if ($stored.ContainsKey($part)) { $base[$part] = New-List $stored[$part] }
    }
    return $base
}

function Merge-ByKey($Current, $Incoming, [string] $Field) {
    $keys = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($item in $Incoming) { [void] $keys.Add([string] $item[$Field]) }
    $merged = New-Object System.Collections.Generic.List[object]
    foreach ($item in $Current) { if (-not $keys.Contains([string] $item[$Field])) { $merged.Add($item) } }
    foreach ($item in $Incoming) { $merged.Add($item) }
    return , $merged
}

function Merge-Call($Base, $Data) {
    # Une commande reçue remplace la commande ET toutes ses lignes : une ligne absente de la réponse disparaît.
    $Base['orders'] = Merge-ByKey $Base['orders'] $Data['orders'] 'orderNumber'
    $received = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($order in $Data['orders']) { [void] $received.Add([string] $order['orderNumber']) }
    $lines = New-Object System.Collections.Generic.List[object]
    foreach ($line in $Base['lines']) { if (-not $received.Contains([string] $line['orderNumber'])) { $lines.Add($line) } }
    foreach ($line in $Data['lines']) { $lines.Add($line) }
    $Base['lines'] = $lines
    $Base['summary'] = Merge-ByKey $Base['summary'] $Data['summary'] 'day'
    $Base['creditNotes'] = Merge-ByKey $Base['creditNotes'] $Data['creditNotes'] 'number'
}

function Write-Atomic([string] $Path, [string] $Text, $Encoding) {
    $folder = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
    $temporary = "$Path.tmp"
    [System.IO.File]::WriteAllText($temporary, $Text, $Encoding)
    if (Test-Path -LiteralPath $Path) {
        [System.IO.File]::Replace($temporary, $Path, "$Path.bak")
    } else {
        [System.IO.File]::Move($temporary, $Path)
    }
}

# ---------------------------------------------------------------- CSV au format Excel français

function Format-Cell($Value) {
    if ($null -eq $Value) { return '' }
    if ($Value -is [bool]) { if ($Value) { return 'VRAI' } else { return 'FAUX' } }
    if ($Value -is [decimal] -or $Value -is [double] -or $Value -is [int] -or $Value -is [long]) {
        return ([decimal] $Value).ToString('0.#####', $French)
    }
    if ($Value -is [System.Array]) { $Value = ($Value | ForEach-Object { [string] $_ }) -join ',' }
    $text = [string] $Value
    if ($text -match '[;"\r\n]') { return '"' + $text.Replace('"', '""') + '"' }
    return $text
}

function Get-Field($Item, [string] $Path) {
    $value = $Item
    foreach ($segment in $Path.Split('.')) {
        if ($null -eq $value -or -not $value.ContainsKey($segment)) { return $null }
        $value = $value[$segment]
    }
    return $value
}

function Write-Csv([string] $Name, [string[]] $Columns, $Items) {
    $builder = New-Object System.Text.StringBuilder
    [void] $builder.Append(($Columns | ForEach-Object { $_.Replace('.', '_') }) -join ';').Append("`r`n")
    foreach ($item in $Items) {
        $cells = foreach ($column in $Columns) { Format-Cell (Get-Field $item $column) }
        [void] $builder.Append($cells -join ';').Append("`r`n")
    }
    Write-Atomic (Join-Path $Dossier "csv\$Name") $builder.ToString() $Utf8Bom
}

$TallyColumns = @('orders', 'revenueHt', 'goodsHt', 'vat', 'revenueTtc', 'returnRefundedTtc', 'netRevenueTtc')

function Write-AllCsv($Base) {
    $orderColumns = @('orderNumber', 'placedAt', 'receivedOn', 'status', 'cancelledAt', 'countsAsRevenue',
        'paymentStatus', 'settlementVenue', 'offered', 'offerNature', 'offeredTtc', 'clientele', 'buyerKind', 'companyName',
        'nafCode', 'fulfillment', 'vatMethod', 'subtotalHt', 'discountHt', 'voucherHt', 'deliveryFeeHt',
        'lateFeeHt', 'totalHt', 'goodsHt', 'vat', 'totalTtc', 'returnRefundedTtc', 'settled.settledOn',
        'settled.subtotalHt', 'settled.discountHt', 'settled.voucherHt', 'settled.deliveryFeeHt',
        'settled.lateFeeHt', 'settled.totalHt', 'settled.vat', 'settled.totalTtc')
    Write-Csv 'commandes.csv' $orderColumns ($Base['orders'] | Sort-Object { $_['placedAt'] })
    $lineColumns = @('orderNumber', 'sku', 'article', 'familyId', 'family', 'quantity', 'saleUnit',
        'unitPriceHt', 'lineHt', 'vatRate', 'lineTtc', 'discountIds')
    Write-Csv 'lignes.csv' $lineColumns $Base['lines']
    $summaryColumns = @('day') + $TallyColumns
    foreach ($clientele in @('pro', 'public', 'unknown')) {
        $summaryColumns += ($TallyColumns | ForEach-Object { "byClientele.$clientele.$_" })
    }
    $summaryColumns += @('creditNotesHt', 'creditNotesVat', 'creditNotesTtc')
    Write-Csv 'resume.csv' $summaryColumns ($Base['summary'] | Sort-Object { $_['day'] })
    Write-Csv 'avoirs.csv' @('number', 'issuedOn', 'companyName', 'ht', 'vat', 'ttc', 'orderNumbers') ($Base['creditNotes'] | Sort-Object { $_['issuedOn'] })
}

# ---------------------------------------------------------------- le lancement

function Invoke-Run {
    $base = Read-Base
    $plan = Get-Periods $base
    $key = Read-Key
    $calls = New-Object System.Collections.Generic.List[object]
    foreach ($period in $plan.Periods) { $calls.Add((Invoke-Export $key $period[0] $period[1])) }
    $key = $null

    # Tous les appels ont réussi : à partir d'ici seulement, on écrit.
    Save-Archive $calls
    $received = 0
    foreach ($call in $calls) {
        Merge-Call $base $call.Data
        $received += @($call.Data['orders']).Count
    }
    if ($base['monthsReread'] -notcontains $plan.PreviousMonth) { $base['monthsReread'].Add($plan.PreviousMonth) }
    $updatedAt = [DateTimeOffset]::Now.ToString('yyyy-MM-ddTHH:mm:sszzz', [System.Globalization.CultureInfo]::InvariantCulture)
    $base['updatedAt'] = $updatedAt
    $serialized = $Json.Serialize($base)
    Write-Atomic (Join-Path $Dossier 'base\ventes.json') $serialized $Utf8NoBom

    # ventes.js : la page, ouverte en file://, ne peut pas lire un JSON ; elle charge un script.
    $page = @{ misAJourLe = $updatedAt; orders = $base['orders']; lines = $base['lines']; creditNotes = $base['creditNotes']; summary = $base['summary'] }
    Write-Atomic (Join-Path $Dossier 'ventes.js') ("window.VENTES = " + $Json.Serialize($page) + ";`r`n") $Utf8NoBom
    Write-AllCsv $base

    $periodsText = ($calls | ForEach-Object { "$($_.From)..$($_.To)" }) -join ' + '
    Write-ExportLog "OK $periodsText : $received commandes reçues, base de $($base['orders'].Count) commandes."
    Write-Host "Export terminé : $received commandes reçues ($periodsText)."
}

try {
    if ($Deplanifier) { Unregister-ExportTask; exit 0 }
    if (-not [string]::IsNullOrEmpty($Planifier)) { Register-ExportTask $Planifier; exit 0 }
    if ($NouvelleCle) { Save-Key; exit 0 }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-Run
    exit 0
} catch {
    $cause = $_.Exception.Message
    try { Write-ExportLog "ÉCHEC $cause" } catch { Write-Warning "Journal impossible : $($_.Exception.Message)" }
    Write-Host "ÉCHEC : $cause" -ForegroundColor Red
    Show-Notification 'Ventes LFD : export en échec' $cause
    exit 1
}
