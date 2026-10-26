function New-MediatorQuery($Connection, $Request) {
    $command = $Connection.CreateCommand()
    $command.CommandTimeout = 5
    # Sin SELECT *, PAN, cuentas, secretos ni ejecución de procedimientos.
    $command.CommandText = @'
SET LOCK_TIMEOUT 3000;
SELECT TOP (@take)
  CONVERT(varchar(20), j.jnlTraceId) AS traceId,
  NULLIF(RTRIM(j.jnlTerminalId), '') AS terminalId,
  CONVERT(varchar(20), j.jnlTerminalSeq) AS terminalSequence,
  CONVERT(varchar(23), j.jnlRealDate, 121) AS occurredAt,
  j.jnlTrnCode AS transactionCode, j.jnlMsgType AS messageType, j.jnlRetCode AS returnCode,
  CASE WHEN DATALENGTH(m.msgRequest) <= 131072 THEN CONVERT(nvarchar(max), m.msgRequest) ELSE NULL END AS requestXml,
  CASE WHEN DATALENGTH(m.msgResponse) <= 131072 THEN CONVERT(nvarchar(max), m.msgResponse) ELSE NULL END AS responseXml
FROM [Mediator].[dbo].[MDT_Journal] AS j WITH (NOLOCK)
INNER JOIN [Mediator].[dbo].[MDT_Message] AS m ON j.jnlTraceId = m.msgTraceId
WHERE j.jnlEntityId = @entity AND j.jnlChannelId = @channel
  AND j.jnlRealDate BETWEEN @from AND @to
'@
    [void] $command.Parameters.Add('@take', [System.Data.SqlDbType]::Int)
    $command.Parameters['@take'].Value = [int] $request.limit + 1
    [void] $command.Parameters.Add('@entity', [System.Data.SqlDbType]::SmallInt)
    $command.Parameters['@entity'].Value = [int16] $request.entityId
    [void] $command.Parameters.Add('@channel', [System.Data.SqlDbType]::SmallInt)
    $command.Parameters['@channel'].Value = [int16] $request.channelId
    foreach ($bound in @('from', 'to')) {
        [void] $command.Parameters.Add('@' + $bound, [System.Data.SqlDbType]::DateTime)
        $command.Parameters['@' + $bound].Value = [DateTime]::ParseExact($request.$bound, 'yyyy-MM-dd HH:mm:ss.fff', [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None)
    }
    if ($request.terminalId -ne '') {
        $command.CommandText += ' AND j.jnlTerminalId = @terminal'
        [void] $command.Parameters.Add('@terminal', [System.Data.SqlDbType]::VarChar, 10)
        $command.Parameters['@terminal'].Value = $request.terminalId
    }
    if ($request.transactionCode -ne '') {
        $command.CommandText += ' AND j.jnlTrnCode = @code'
        [void] $command.Parameters.Add('@code', [System.Data.SqlDbType]::VarChar, 6)
        $command.Parameters['@code'].Value = $request.transactionCode
    }
    if ($request.terminalSequence -ne '') {
        $command.CommandText += ' AND j.jnlTerminalSeq = @sequence'
        [void] $command.Parameters.Add('@sequence', [System.Data.SqlDbType]::BigInt)
        $command.Parameters['@sequence'].Value = [long] $request.terminalSequence
    }
    if ($request.returnCode -ne '') {
        $command.CommandText += ' AND j.jnlRetCode = @returnCode'
        [void] $command.Parameters.Add('@returnCode', [System.Data.SqlDbType]::Int)
        $command.Parameters['@returnCode'].Value = [int] $request.returnCode
    }
    $command.CommandText += ' ORDER BY m.msgTraceId DESC;'
    return $command
}

function New-MediatorLiveQuery($Connection, $Request) {
    if ($Request.mode -cne 'live' -or $Request.environment -cne 'PREPROD' -or
        [int] $Request.entityId -ne 205 -or [int] $Request.channelId -ne 1 -or
        [int] $Request.limit -lt 1 -or [int] $Request.limit -gt 50 -or
        @($Request.PSObject.Properties).Count -ne 5) { throw 'Invalid live request' }
    $command = $Connection.CreateCommand()
    $command.CommandTimeout = 5
    # The database projects only a masked card. Full PAN and XML never leave SQL Server.
    $command.CommandText = @'
SET LOCK_TIMEOUT 3000;
SELECT TOP (@take)
  CONVERT(varchar(20), j.jnlTraceId) AS traceId,
  NULLIF(RTRIM(j.jnlTerminalId), '') AS terminalId,
  CONVERT(varchar(20), j.jnlTerminalSeq) AS terminalSequence,
  CONVERT(varchar(23), j.jnlRealDate, 121) AS occurredAt,
  j.jnlTrnCode AS transactionCode, j.jnlMsgType AS messageType,
  j.jnlRetCode AS returnCode,
  CASE WHEN LEN(LTRIM(RTRIM(j.jnlCardNumber))) BETWEEN 12 AND 19
    AND LTRIM(RTRIM(j.jnlCardNumber)) COLLATE Latin1_General_BIN2 NOT LIKE '%[^0-9]%'
    THEN '**** ' + RIGHT(LTRIM(RTRIM(j.jnlCardNumber)), 4)
    ELSE NULL END AS cardMasked,
  CONVERT(varchar(32), j.jnlValueTrn) AS valueText
FROM [Mediator].[dbo].[MDT_Journal] AS j WITH (NOLOCK)
INNER JOIN [Mediator].[dbo].[MDT_Message] AS m ON j.jnlTraceId = m.msgTraceId
WHERE j.jnlEntityId = @entity AND j.jnlChannelId = @channel
ORDER BY m.msgTraceId DESC;
'@
    [void] $command.Parameters.Add('@take', [System.Data.SqlDbType]::Int)
    $command.Parameters['@take'].Value = [int] $Request.limit + 1
    [void] $command.Parameters.Add('@entity', [System.Data.SqlDbType]::SmallInt)
    $command.Parameters['@entity'].Value = [int16] $Request.entityId
    [void] $command.Parameters.Add('@channel', [System.Data.SqlDbType]::SmallInt)
    $command.Parameters['@channel'].Value = [int16] $Request.channelId
    return $command
}
