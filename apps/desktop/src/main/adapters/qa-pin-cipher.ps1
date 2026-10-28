param([string]$KeyDirectory, [string]$KeyReference, [switch]$Persistent)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
do {
    $qaKey = $null
    $qaInput = $null
    $qaOutput = $null
    $qaPointer = [IntPtr]::Zero
    $qaCipher = $null
    $qaTransform = $null
    try {
        $qaLine = [Console]::ReadLine()
        if ($null -eq $qaLine) { break }
        if ($qaLine -notmatch '^[A-F0-9]{16}$') { throw 'INVALID_INPUT' }
        if ($KeyReference -notmatch '^[a-fA-F0-9-]{36}$') { throw 'INVALID_REFERENCE' }
        $qaCredential = Import-Clixml -LiteralPath (Join-Path $KeyDirectory "$KeyReference.credential.xml")
        if ($qaCredential -isnot [System.Management.Automation.PSCredential] -or $qaCredential.UserName -ne 'QA:TDEA_2KEY_ECB') { throw 'INVALID_TEST_KEY' }
        $qaPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($qaCredential.Password)
        $qaKeyText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($qaPointer)
        if ($qaKeyText -notmatch '^[A-Fa-f0-9]{32}$') { throw 'INVALID_TEST_KEY' }
        $qaKey = [byte[]]::new(16)
        for ($qaIndex = 0; $qaIndex -lt 16; $qaIndex++) { $qaKey[$qaIndex] = [Convert]::ToByte($qaKeyText.Substring($qaIndex * 2, 2), 16) }
        $qaKeyText = $null
        $qaInput = [byte[]]::new(8)
        for ($qaIndex = 0; $qaIndex -lt 8; $qaIndex++) { $qaInput[$qaIndex] = [Convert]::ToByte($qaLine.Substring($qaIndex * 2, 2), 16) }
        $qaLine = $null
        $qaCipher = [Security.Cryptography.TripleDES]::Create()
        $qaCipher.Mode = [Security.Cryptography.CipherMode]::ECB
        $qaCipher.Padding = [Security.Cryptography.PaddingMode]::None
        $qaCipher.Key = $qaKey
        $qaTransform = $qaCipher.CreateEncryptor()
        $qaOutput = $qaTransform.TransformFinalBlock($qaInput, 0, 8)
        [Console]::WriteLine([BitConverter]::ToString($qaOutput).Replace('-', ''))
        [Console]::Out.Flush()
    } catch {
        exit 1
    } finally {
        foreach ($qaBuffer in @($qaKey, $qaInput, $qaOutput)) { if ($null -ne $qaBuffer) { [Array]::Clear($qaBuffer, 0, $qaBuffer.Length) } }
        if ($null -ne $qaTransform) { $qaTransform.Dispose() }
        if ($null -ne $qaCipher) { $qaCipher.Dispose() }
        if ($qaPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($qaPointer) }
    }
} while ($Persistent)
