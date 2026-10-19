param([string]$UserDataDirectory = (Join-Path $env:APPDATA 'Coonecta ATM Simulator'))
# Administrative QA import. The caller supplies components through a private
# stdin pipe, never arguments/files. This stores an ATM master key, not a PIN key.
$ErrorActionPreference = 'Stop'
$qaBuffers = [Collections.Generic.List[byte[]]]::new()
$qaSecure = $null
$qaTemporary = $null
$qaInput = $null
function Test-ExactFields($Value, [string[]]$Fields) {
    $qaNames = @($Value.PSObject.Properties.Name)
    return $qaNames.Count -eq $Fields.Count -and @($qaNames | Where-Object { $_ -cnotin $Fields }).Count -eq 0
}
function Read-KeyBytes([string]$Value) {
    if ($Value -cnotmatch '^[A-Fa-f0-9]{32}$') { throw 'INVALID_COMPONENT' }
    $qaBytes = [byte[]]::new(16)
    [void]$qaBuffers.Add($qaBytes)
    for ($qaIndex = 0; $qaIndex -lt 16; $qaIndex++) { $qaBytes[$qaIndex] = [Convert]::ToByte($Value.Substring($qaIndex * 2, 2), 16) }
    return ,$qaBytes
}
function Get-CheckValue([byte[]]$Value) {
    $qaCipher = [Security.Cryptography.TripleDES]::Create()
    $qaTransform = $null
    try {
        $qaCipher.Key = $Value
        $qaCipher.Mode = [Security.Cryptography.CipherMode]::ECB
        $qaCipher.Padding = [Security.Cryptography.PaddingMode]::None
        $qaTransform = $qaCipher.CreateEncryptor()
        $qaCheck = $qaTransform.TransformFinalBlock([byte[]]::new(8), 0, 8)
        [void]$qaBuffers.Add($qaCheck)
        return [BitConverter]::ToString($qaCheck, 0, 3).Replace('-', '')
    } finally {
        if ($null -ne $qaTransform) { $qaTransform.Dispose() }
        $qaCipher.Dispose()
    }
}
try {
    $qaLine = [Console]::ReadLine()
    if ($null -eq $qaLine -or $qaLine.Length -gt 4096) { throw 'INVALID_INPUT' }
    $qaInput = $qaLine | ConvertFrom-Json
    $qaLine = $null
    if (-not (Test-ExactFields $qaInput @('version','environment','terminalId','keyReference','components','expectedMasterCheck','expectedNetworkCheck')) -or
        $qaInput.version -ne 1 -or $qaInput.environment -cne 'QA' -or
        $qaInput.terminalId -cnotmatch '^[A-Z0-9]{8}$' -or
        $qaInput.keyReference -notmatch '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$' -or
        $qaInput.expectedMasterCheck -cnotmatch '^[A-F0-9]{6}$' -or
        $qaInput.expectedNetworkCheck -cnotmatch '^[A-F0-9]{6}$' -or
        @($qaInput.components).Count -ne 2) { throw 'INVALID_INPUT' }
    $qaValues = @()
    foreach ($qaComponent in $qaInput.components) {
        if (-not (Test-ExactFields $qaComponent @('id','value','check')) -or
            $qaComponent.id -isnot [int] -or $qaComponent.id -lt 1 -or
            $qaComponent.check -cnotmatch '^[A-F0-9]{4}$') { throw 'INVALID_COMPONENT' }
        $qaBytes = Read-KeyBytes $qaComponent.value
        if ((Get-CheckValue $qaBytes).Substring(0, 4) -cne $qaComponent.check) { throw 'COMPONENT_CHECK_MISMATCH' }
        $qaValues += ,$qaBytes
        $qaComponent.value = $null
    }
    if ($qaInput.components[0].id -eq $qaInput.components[1].id) { throw 'DUPLICATE_COMPONENT' }
    $qaCombined = [byte[]]::new(16)
    [void]$qaBuffers.Add($qaCombined)
    for ($qaIndex = 0; $qaIndex -lt 16; $qaIndex++) { $qaCombined[$qaIndex] = $qaValues[0][$qaIndex] -bxor $qaValues[1][$qaIndex] }
    $qaCheck = Get-CheckValue $qaCombined
    if ($qaCheck -cne $qaInput.expectedMasterCheck) { throw 'MASTER_CHECK_MISMATCH' }
    $qaDirectory = Join-Path ([IO.Path]::GetFullPath($UserDataDirectory)) 'qa-atm-master-keys'
    $qaReference = ([Guid]$qaInput.keyReference).ToString()
    $qaDestination = Join-Path $qaDirectory ($qaReference + '.credential.xml')
    if ([IO.File]::Exists($qaDestination)) { throw 'ALREADY_ENROLLED' }
    $qaSecure = [Security.SecureString]::new()
    foreach ($qaByte in $qaCombined) {
        foreach ($qaCharacter in $qaByte.ToString('X2').ToCharArray()) { $qaSecure.AppendChar($qaCharacter) }
    }
    $qaSecure.MakeReadOnly()
    $qaCredential = [Management.Automation.PSCredential]::new(('QA:ATM_MASTER:TDEA_2KEY_ECB:' + $qaInput.terminalId), $qaSecure)
    [void][IO.Directory]::CreateDirectory($qaDirectory)
    $qaTemporary = Join-Path $qaDirectory ([Guid]::NewGuid().ToString() + '.credential.xml.tmp')
    $qaCredential | Export-Clixml -LiteralPath $qaTemporary -NoClobber
    # Both paths are inside the explicit userData/qa-atm-master-keys directory.
    [IO.File]::Move($qaTemporary, $qaDestination)
    $qaTemporary = $null
    [ordered]@{
        keyReference = $qaReference
        terminalId = $qaInput.terminalId
        purpose = 'ATM_MASTER'
        masterCheckMatched = $true
        networkCheckMatched = ($qaCheck -ceq $qaInput.expectedNetworkCheck)
        protectedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    } | ConvertTo-Json -Compress
} catch {
    [Console]::Error.WriteLine('QA_ATM_COMPONENTS_NOT_ENROLLED')
    exit 1
} finally {
    foreach ($qaBuffer in $qaBuffers) { [Array]::Clear($qaBuffer, 0, $qaBuffer.Length) }
    if ($null -ne $qaSecure) { $qaSecure.Dispose() }
    if ($null -ne $qaTemporary -and [IO.File]::Exists($qaTemporary)) { [IO.File]::Delete($qaTemporary) }
    $qaInput = $null
    $qaLine = $null
    $qaCredential = $null
}
