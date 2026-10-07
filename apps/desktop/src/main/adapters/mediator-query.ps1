param([Parameter(Mandatory = $true)][string] $ConfigurationPath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'mediator-redaction.ps1')
. (Join-Path $PSScriptRoot 'mediator-command.ps1')
$connection = $null
$command = $null
$reader = $null
try {
    Add-Type -AssemblyName System.Data
    $config = Get-Content -LiteralPath $ConfigurationPath -Raw | ConvertFrom-Json
    if ($config.environment -cne 'PREPROD' -or $config.database -cne 'Mediator' -or
        $config.server -notmatch '^tcp:[A-Za-z0-9.-]+,[0-9]{1,5}$' -or
        -not [System.IO.Path]::IsPathRooted($config.credentialFile) -or
        @($config.PSObject.Properties).Count -ne 4) { throw 'Invalid configuration' }
    $credential = Import-Clixml -LiteralPath $config.credentialFile
    if ($credential -isnot [System.Management.Automation.PSCredential]) { throw 'Invalid credential' }
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
    $builder['Data Source'] = $config.server
    $builder['Initial Catalog'] = 'Mediator'
    $builder['User ID'] = $credential.UserName
    $builder['Password'] = $credential.GetNetworkCredential().Password
    $builder['Encrypt'] = $true
    $builder['TrustServerCertificate'] = $false
    $builder['Connect Timeout'] = 5
    $builder['Application Name'] = 'Coonecta QA Observer'
    $builder['ApplicationIntent'] = 'ReadOnly'
    $builder['Pooling'] = $false
    $connection = [System.Data.SqlClient.SqlConnection]::new($builder.ConnectionString)
    $builder.Clear()
    $connection.Open()
    # ApplicationIntent no limita permisos. Rechazar cuentas elevadas o con escritura
    # visible en la base o en las tablas observadas antes de leer transacciones.
    $command = $connection.CreateCommand()
    $command.CommandTimeout = 5
    $command.CommandText = @'
SELECT CASE WHEN IS_ROLEMEMBER('db_owner') = 1 OR IS_SRVROLEMEMBER('sysadmin') = 1
 OR EXISTS (SELECT 1 FROM sys.fn_my_permissions(NULL, 'DATABASE') WHERE permission_name IN
 ('CONTROL','ALTER','INSERT','UPDATE','DELETE','CREATE TABLE','CREATE PROCEDURE','ALTER ANY ROLE','ALTER ANY USER'))
 OR EXISTS (SELECT 1 FROM sys.fn_my_permissions('dbo.MDT_Journal', 'OBJECT') WHERE permission_name IN ('CONTROL','ALTER','INSERT','UPDATE','DELETE','TAKE OWNERSHIP'))
 OR EXISTS (SELECT 1 FROM sys.fn_my_permissions('dbo.MDT_Message', 'OBJECT') WHERE permission_name IN ('CONTROL','ALTER','INSERT','UPDATE','DELETE','TAKE OWNERSHIP'))
 THEN 1 ELSE 0 END;
'@
    if ([int] $command.ExecuteScalar() -ne 0) {
        [Console]::WriteLine('{"ok":false,"code":"FORBIDDEN"}')
        return
    }
    $command.Dispose()
    $command = New-MediatorQuery $connection $request
    $reader = $command.ExecuteReader()
    $rows = [System.Collections.Generic.List[object]]::new()
    $hasMore = $false
    while ($reader.Read()) {
        if ($rows.Count -eq [int] $request.limit) { $hasMore = $true; break }
        $row = [ordered] @{}
        foreach ($key in @('traceId', 'terminalId', 'terminalSequence', 'occurredAt', 'transactionCode', 'messageType', 'returnCode')) {
            $value = $reader[$key]
            $row[$key] = if ($value -is [System.DBNull]) { $null } else { $value }
        }
        $row['requestStructure'] = Protect-MediatorXml ([string] $reader['requestXml'])
        $row['responseStructure'] = Protect-MediatorXml ([string] $reader['responseXml'])
        $rows.Add([pscustomobject] $row)
    }
    [Console]::WriteLine((@{ ok = $true; value = @{ rows = @($rows.ToArray()); hasMore = $hasMore } } | ConvertTo-Json -Depth 8 -Compress))
} catch {
    $code = 'SERVICE_UNAVAILABLE'
    $errorCause = $_.Exception
    while ($null -ne $errorCause) {
        if ($errorCause -is [System.Data.SqlClient.SqlException]) {
            if ($errorCause.Number -eq -2 -or $errorCause.Number -eq 1222) { $code = 'TIMEOUT' }
            if ($errorCause.Number -in @(-2146893019, -2146762487, -2146893022, -2146762481)) { $code = 'TLS_ERROR' }
        }
        $errorCause = $errorCause.InnerException
    }
    # Nunca emitir el mensaje del driver, SQL, conexión, credenciales o XML.
    [Console]::WriteLine((@{ ok = $false; code = $code } | ConvertTo-Json -Compress))
} finally {
    if ($null -ne $reader) { $reader.Dispose() }
    if ($null -ne $command) { $command.Dispose() }
    if ($null -ne $connection) { $connection.Dispose() }
}
