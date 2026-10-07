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
