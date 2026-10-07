function Protect-MediatorXml([string] $Xml) {
    if ([string]::IsNullOrEmpty($Xml)) { return '[Mensaje ausente o protegido por longitud]' }
    if ($Xml.Length -gt 65536) { return '[Mensaje protegido: limite excedido]' }
    $reader = $null
    try {
        $settings = [System.Xml.XmlReaderSettings]::new()
        $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
        $settings.XmlResolver = $null
        $settings.MaxCharactersInDocument = 65536
        $reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($Xml), $settings)
        $output = [System.Text.StringBuilder]::new()
        $nodes = 0
        # Sólo estructura documentada; ningún texto, atributo libre, comentario o namespace.
        $elements = @('ExtremeMsg', 'ExtremeMsgReply', 'Header', 'Data', 'FxTable', 'HField', 'DField')
        $fields = @('TraceId', 'EntityId', 'EntityIdDest', 'ChannelId', 'RealDate', 'TerminalID', 'TerminalId', 'TerminalSeq', 'MsgType', 'TrnCode', 'ValueTrn', 'BussDate', 'RetCode', 'Reverse', 'AccountId1', 'AccountId2', 'AccountNum1', 'AccountNum2', 'SubTrnCode', 'CodigoProceso', 'Mensaje', 'FechaContable', 'SaldoTotal', 'SaldoDisponible', 'ValorDebitadoParcial', 'MappedRespCode', 'MsgErr')
        while ($reader.Read()) {
            $nodes++
            if ($nodes -gt 512 -or $reader.Depth -gt 20) { return '[Mensaje protegido: limite excedido]' }
            $name = 'Campo'
            if ($elements -ccontains $reader.LocalName) { $name = $reader.LocalName }
            if ($reader.NodeType -eq [System.Xml.XmlNodeType]::Element) {
                [void] $output.Append('<').Append($name)
                $fieldName = $reader.GetAttribute('name')
                if ($fields -ccontains $fieldName) { [void] $output.Append(' name="').Append($fieldName).Append('"') }
                if ($reader.IsEmptyElement) { [void] $output.Append('>[PROTEGIDO]</').Append($name).Append('>') }
                else { [void] $output.Append('>') }
            } elseif ($reader.NodeType -eq [System.Xml.XmlNodeType]::EndElement) {
                [void] $output.Append('</').Append($name).Append('>')
            } elseif ($reader.NodeType -in @([System.Xml.XmlNodeType]::Text, [System.Xml.XmlNodeType]::CDATA, [System.Xml.XmlNodeType]::SignificantWhitespace)) {
                [void] $output.Append('[PROTEGIDO]')
            }
            if ($output.Length -gt 16384) { return '[Mensaje protegido: limite excedido]' }
        }
        return $output.ToString()
    } catch { return '[Mensaje protegido: XML no validado]' }
    finally { if ($null -ne $reader) { $reader.Dispose() } }
}
