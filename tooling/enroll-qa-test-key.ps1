param(
    [Parameter(Mandatory=$true)][Guid]$ProfileId,
    [switch]$InputFromStdin,
    [string]$UserDataDirectory = (Join-Path $env:APPDATA 'Coonecta ATM Simulator')
)
# Provision a separately supplied TEST key through the native dialog or an
# administrative private stdin pipe. Never accept it in command arguments.
$ErrorActionPreference = 'Stop'
$qaForm = $null
$qaBox = $null
$qaConfirm = $null
$qaKeyBytes = $null
$qaCipher = $null
$qaSecure = $null
$qaTemporary = $null
try {
    $qaData = [IO.Path]::GetFullPath($UserDataDirectory)
    $qaProfilePath = Join-Path $qaData 'qa-execution-profiles.json'
    if ((Get-Item -LiteralPath $qaProfilePath).Length -gt 65536) { throw 'INVALID_PROFILE' }
    $qaProfiles = Get-Content -LiteralPath $qaProfilePath -Raw | ConvertFrom-Json
    $qaMatches = @($qaProfiles.profiles | Where-Object { $_.id -eq $ProfileId.ToString() })
    if ($qaProfiles.version -ne 1 -or $qaMatches.Count -ne 1) { throw 'INVALID_PROFILE' }
    $qaProfile = $qaMatches[0]
    if ($qaProfile.environment -ne 'QA' -or $qaProfile.pinAlgorithm -ne 'TDEA_2KEY_ECB' -or
        $qaProfile.pinEncoding -ne 'EXTREME_ANSI_IL' -or $qaProfile.terminalId -notmatch '^[A-Z0-9]{8}$' -or
        [string]::IsNullOrWhiteSpace($qaProfile.approvalReference)) { throw 'INVALID_PROFILE' }
    $qaReference = ([Guid]$qaProfile.keyReference).ToString()
    $qaDirectory = Join-Path $qaData 'qa-test-keys'
    $qaDestination = Join-Path $qaDirectory ($qaReference + '.credential.xml')
    if (Test-Path -LiteralPath $qaDestination) { throw 'KEY_ALREADY_EXISTS' }
    if ($InputFromStdin) {
        # Administrative import of an already supplied QA key through a private pipe.
        # Values are never accepted in process arguments or emitted in diagnostics.
        $qaLine = [Console]::ReadLine()
        if ($null -eq $qaLine -or $qaLine.Length -gt 1024) { throw 'INVALID_INPUT' }
        $qaInput = $qaLine | ConvertFrom-Json
        $qaLine = $null
        $qaNames = @($qaInput.PSObject.Properties.Name)
        if ($qaNames.Count -ne 2 -or @($qaNames | Where-Object { $_ -cnotin @('key','expectedCheck') }).Count -ne 0 -or
            $qaInput.key -cnotmatch '^[A-F0-9]{32}$' -or $qaInput.expectedCheck -cnotmatch '^[A-F0-9]{6}$') { throw 'INVALID_INPUT' }
        $qaClearText = $qaInput.key
        $qaExpectedCheck = $qaInput.expectedCheck
        $qaInput.key = $null
    } else {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $qaForm = [Windows.Forms.Form]::new()
    $qaForm.Text = 'Coonecta QA - registrar clave TEST aprobada'
    $qaForm.ClientSize = [Drawing.Size]::new(480, 260)
    $qaForm.StartPosition = 'CenterScreen'
    $qaForm.FormBorderStyle = 'FixedDialog'
    $qaForm.MaximizeBox = $false
    $qaForm.MinimizeBox = $false
    $qaForm.TopMost = $true
    $qaLabel = [Windows.Forms.Label]::new()
    $qaLabel.Text = "Terminal: $($qaProfile.terminalId)`r`nSolo clave TEST TDEA de 32 caracteres hexadecimales.`r`nIngresa la clave y repitela. No es el PIN de la tarjeta."
    $qaLabel.Location = [Drawing.Point]::new(20, 15)
    $qaLabel.Size = [Drawing.Size]::new(440, 70)
    $qaBox = [Windows.Forms.TextBox]::new()
    $qaConfirm = [Windows.Forms.TextBox]::new()
    foreach ($qaInputBox in @($qaBox, $qaConfirm)) {
        $qaInputBox.UseSystemPasswordChar = $true
        $qaInputBox.MaxLength = 32
        $qaInputBox.Width = 440
    }
    $qaBox.Location = [Drawing.Point]::new(20, 100)
    $qaConfirm.Location = [Drawing.Point]::new(20, 145)
    $qaOk = [Windows.Forms.Button]::new()
    $qaOk.Text = 'Proteger'
    $qaOk.Location = [Drawing.Point]::new(280, 205)
    $qaOk.Add_Click({
        if ($qaBox.Text -match '^[A-Fa-f0-9]{32}$' -and $qaBox.Text -ceq $qaConfirm.Text) { $qaForm.DialogResult = 'OK' }
        else { $qaBox.Clear(); $qaConfirm.Clear(); $qaBox.Focus() }
    })
    $qaCancel = [Windows.Forms.Button]::new()
    $qaCancel.Text = 'Cancelar'
    $qaCancel.DialogResult = 'Cancel'
    $qaCancel.Location = [Drawing.Point]::new(380, 205)
    $qaForm.AcceptButton = $qaOk
    $qaForm.CancelButton = $qaCancel
    $qaForm.Controls.AddRange(@($qaLabel, $qaBox, $qaConfirm, $qaOk, $qaCancel))
    if ($qaForm.ShowDialog() -ne 'OK') { exit 2 }
    $qaClearText = $qaBox.Text
    }
    $qaKeyBytes = [byte[]]::new(16)
    for ($qaIndex = 0; $qaIndex -lt 16; $qaIndex++) { $qaKeyBytes[$qaIndex] = [Convert]::ToByte($qaClearText.Substring($qaIndex * 2, 2), 16) }
    $qaCipher = [Security.Cryptography.TripleDES]::Create()
    $qaCipher.Key = $qaKeyBytes # Reject invalid/weak keys before provisioning.
    if ($InputFromStdin) {
        $qaCipher.Mode = [Security.Cryptography.CipherMode]::ECB
        $qaCipher.Padding = [Security.Cryptography.PaddingMode]::None
        $qaTransform = $qaCipher.CreateEncryptor()
        try {
            $qaCheckBytes = $qaTransform.TransformFinalBlock([byte[]]::new(8), 0, 8)
            if ([BitConverter]::ToString($qaCheckBytes, 0, 3).Replace('-', '') -cne $qaExpectedCheck) { throw 'CHECK_MISMATCH' }
        } finally {
            $qaTransform.Dispose()
            if ($null -ne $qaCheckBytes) { [Array]::Clear($qaCheckBytes, 0, $qaCheckBytes.Length) }
        }
    }
    $qaSecure = [Security.SecureString]::new()
    foreach ($qaCharacter in $qaClearText.ToUpperInvariant().ToCharArray()) { $qaSecure.AppendChar($qaCharacter) }
    $qaSecure.MakeReadOnly()
    $qaClearText = $null
    if ($null -ne $qaBox) { $qaBox.Clear() }
    if ($null -ne $qaConfirm) { $qaConfirm.Clear() }
    $qaCredential = [System.Management.Automation.PSCredential]::new('QA:TDEA_2KEY_ECB', $qaSecure)
    [void][IO.Directory]::CreateDirectory($qaDirectory)
    $qaTemporary = Join-Path $qaDirectory ([Guid]::NewGuid().ToString() + '.credential.xml.tmp')
    $qaCredential | Export-Clixml -LiteralPath $qaTemporary -NoClobber
    # Both paths are inside the explicit userData/qa-test-keys directory, use
    # literal .NET paths, and never overwrite a preexisting credential.
    [IO.File]::Move($qaTemporary, $qaDestination)
    $qaTemporary = $null
    [Console]::WriteLine('QA_TEST_KEY_PROTECTED')
} catch {
    [Console]::Error.WriteLine('QA_TEST_KEY_NOT_ENROLLED')
    exit 1
} finally {
    $qaClearText = $null
    $qaInput = $null
    $qaLine = $null
    if ($null -ne $qaBox) { $qaBox.Clear() }
    if ($null -ne $qaConfirm) { $qaConfirm.Clear() }
    if ($null -ne $qaKeyBytes) { [Array]::Clear($qaKeyBytes, 0, $qaKeyBytes.Length) }
    if ($null -ne $qaCipher) { $qaCipher.Dispose() }
    if ($null -ne $qaSecure) { $qaSecure.Dispose() }
    if ($null -ne $qaForm) { $qaForm.Dispose() }
    if ($null -ne $qaTemporary -and [IO.File]::Exists($qaTemporary)) { [IO.File]::Delete($qaTemporary) }
}
