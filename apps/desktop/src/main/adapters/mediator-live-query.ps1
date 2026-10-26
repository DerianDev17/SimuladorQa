param([Parameter(Mandatory = $true)][string] $ConfigurationPath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'mediator-command.ps1')

function Write-Failure($Exception) {
    $code = 'SERVICE_UNAVAILABLE'
    $cause = $Exception
    while ($null -ne $cause) {
        if ($cause -is [System.Data.SqlClient.SqlException]) {
            if ($cause.Number -eq -2 -or $cause.Number -eq 1222) { $code = 'TIMEOUT' }
        }
        $cause = $cause.InnerException
    }
    [Console]::WriteLine((@{ ok = $false; code = $code } | ConvertTo-Json -Compress))
}

$connection = $null
try {
    Add-Type -AssemblyName System.Data
    $config = Get-Content -LiteralPath $ConfigurationPath -Raw | ConvertFrom-Json
    if ($config.environment -cne 'PREPROD' -or $config.database -cne 'Mediator' -or
        $config.server -notmatch '^tcp:[A-Za-z0-9.-]+,[0-9]{1,5}$' -or
        -not [System.IO.Path]::IsPathRooted($config.credentialFile) -or
        @($config.PSObject.Properties).Count -ne 4) { throw 'Invalid configuration' }
    $credential = Import-Clixml -LiteralPath $config.credentialFile
    if ($credential -isnot [System.Management.Automation.PSCredential]) { throw 'Invalid credential' }
    $builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
    $builder['Data Source'] = $config.server
    $builder['Initial Catalog'] = 'Mediator'
    $builder['User ID'] = $credential.UserName
    $builder['Password'] = $credential.GetNetworkCredential().Password
    $builder['Encrypt'] = $true
    # Excepcion autorizada solo para el SELECT fijo de Inicio. No se aplica a Historial.
    $builder['TrustServerCertificate'] = $true
    $builder['Connect Timeout'] = 5
    $builder['Application Name'] = 'Coonecta QA Live Observer'
    $builder['ApplicationIntent'] = 'ReadOnly'
    $builder['Pooling'] = $false
    $connection = [System.Data.SqlClient.SqlConnection]::new($builder.ConnectionString)
    $builder.Clear()

    while ($null -ne ($line = [Console]::ReadLine())) {
        $command = $null
        $reader = $null
        try {
            if ($line.Length -gt 512) { throw 'Invalid request size' }
            $request = $line | ConvertFrom-Json
            Assert-MediatorLiveRequest $request
            if ($connection.State -ne [System.Data.ConnectionState]::Open) { $connection.Open() }
            $command = New-MediatorLiveQuery $connection $request
            $reader = $command.ExecuteReader()
            $rows = [System.Collections.Generic.List[object]]::new()
            $hasMore = $false
            while ($reader.Read()) {
                if ($rows.Count -eq [int] $request.limit) { $hasMore = $true; break }
                $row = [ordered] @{}
                foreach ($key in @('traceId', 'terminalId', 'terminalSequence', 'occurredAt', 'transactionCode', 'messageType', 'returnCode', 'cardReference', 'valueText')) {
                    $value = $reader[$key]
                    $row[$key] = if ($value -is [System.DBNull]) { $null } else { $value }
                }
                $rows.Add([pscustomobject] $row)
            }
            [Console]::WriteLine((@{ ok = $true; value = @{ rows = @($rows.ToArray()); hasMore = $hasMore } } | ConvertTo-Json -Depth 5 -Compress))
        } catch {
            Write-Failure $_.Exception
            if ($null -ne $connection -and $connection.State -ne [System.Data.ConnectionState]::Closed) { $connection.Close() }
        } finally {
            if ($null -ne $reader) { $reader.Dispose() }
            if ($null -ne $command) { $command.Dispose() }
        }
    }
} catch {
    Write-Failure $_.Exception
} finally {
    if ($null -ne $connection) { $connection.Dispose() }
}
