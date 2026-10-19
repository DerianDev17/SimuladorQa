$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
$cardContext = [IntPtr]::Zero
$cardHandle = [IntPtr]::Zero
$cardLocked = $false
try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PcscCardNative {
    [StructLayout(LayoutKind.Sequential)] public struct IoRequest { public uint Protocol; public uint Length; }
    [DllImport("winscard.dll")] public static extern uint SCardEstablishContext(uint scope, IntPtr r1, IntPtr r2, out IntPtr context);
    [DllImport("winscard.dll", CharSet=CharSet.Unicode, ExactSpelling=true)] public static extern uint SCardConnectW(IntPtr context, string reader, uint share, uint protocols, out IntPtr card, out uint protocol);
    [DllImport("winscard.dll")] public static extern uint SCardBeginTransaction(IntPtr card);
    [DllImport("winscard.dll")] public static extern uint SCardEndTransaction(IntPtr card, uint disposition);
    [DllImport("winscard.dll")] public static extern uint SCardTransmit(IntPtr card, ref IoRequest pci, byte[] send, uint length, IntPtr recvPci, [Out] byte[] recv, ref uint recvLength);
    [DllImport("winscard.dll", CharSet=CharSet.Unicode, ExactSpelling=true)] public static extern uint SCardStatusW(IntPtr card, [Out] char[] reader, ref uint readerLength, out uint state, out uint protocol, [Out] byte[] atr, ref uint atrLength);
    [DllImport("winscard.dll")] public static extern uint SCardDisconnect(IntPtr card, uint disposition);
    [DllImport("winscard.dll")] public static extern uint SCardReleaseContext(IntPtr context);
}
'@ | Out-Null
    $cardLine = [Console]::ReadLine()
    if (-not $cardLine -or $cardLine.Length -gt 1024) { throw 'CARD_INVALID' }
    $cardRequest = $cardLine | ConvertFrom-Json
    if ($cardRequest.op -ne 'open' -or $cardRequest.readerName -isnot [string] -or $cardRequest.readerName.Length -gt 160) { throw 'CARD_INVALID' }
    $cardTransactional = $cardRequest.transactional -eq $true
    if ([PcscCardNative]::SCardEstablishContext(0, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$cardContext) -ne 0) { throw 'CARD_UNAVAILABLE' }
    [uint32]$cardProtocol = 0
    $cardCode = [PcscCardNative]::SCardConnectW($cardContext, $cardRequest.readerName, 2, 3, [ref]$cardHandle, [ref]$cardProtocol)
    if ($cardCode -ne 0) { throw 'CARD_UNAVAILABLE' }
    if ([PcscCardNative]::SCardBeginTransaction($cardHandle) -ne 0) { throw 'CARD_UNAVAILABLE' }
    $cardLocked = $true
    @{ ok=$true } | ConvertTo-Json -Compress
    while ($null -ne ($cardLine = [Console]::ReadLine())) {
        if ($cardLine.Length -gt 1024) { throw 'CARD_INVALID' }
        $cardRequest = $cardLine | ConvertFrom-Json
        if ($cardRequest.op -eq 'close') { break }
        if ($cardRequest.op -eq 'begin') {
            if (-not $cardLocked -and [PcscCardNative]::SCardBeginTransaction($cardHandle) -ne 0) { throw 'CARD_UNAVAILABLE' }
            $cardLocked = $true
            @{ ok=$true } | ConvertTo-Json -Compress
            continue
        }
        if ($cardRequest.op -eq 'release') {
            if ($cardLocked -and [PcscCardNative]::SCardEndTransaction($cardHandle, 0) -ne 0) { throw 'CARD_UNAVAILABLE' }
            $cardLocked = $false
            @{ ok=$true } | ConvertTo-Json -Compress
            continue
        }
        if ($cardRequest.op -eq 'status') {
            $cardAtr = [byte[]]::new(36)
            $cardReaderBuffer = [char[]]::new(512)
            [uint32]$cardReaderLength = 512
            [uint32]$cardAtrLength = 36
            [uint32]$cardState = 0
            [uint32]$cardStatusProtocol = 0
            $cardCode = [PcscCardNative]::SCardStatusW($cardHandle, $cardReaderBuffer, [ref]$cardReaderLength, [ref]$cardState, [ref]$cardStatusProtocol, $cardAtr, [ref]$cardAtrLength)
            [Array]::Clear($cardAtr, 0, $cardAtr.Length)
            @{ ok=$true; valid=($cardCode -eq 0 -and $cardState -ge 4 -and $cardState -le 6) } | ConvertTo-Json -Compress
            continue
        }
        if ($cardRequest.op -ne 'transmit' -or -not $cardLocked -or $cardRequest.command -isnot [string] -or $cardRequest.command -notmatch '^(?:[A-F0-9]{2}){5,261}$') { throw 'CARD_INVALID' }
        $cardSend = [byte[]]::new($cardRequest.command.Length / 2)
        for ($cardIndex=0; $cardIndex -lt $cardSend.Length; $cardIndex++) { $cardSend[$cardIndex] = [Convert]::ToByte($cardRequest.command.Substring($cardIndex*2, 2), 16) }
        # Only contact SELECT, READ RECORD, GET RESPONSE and GPO with empty PDOL or explicit 9F1A.
        $cardAllowed = ($cardSend[0] -eq 0 -and $cardSend[1] -eq 164 -and $cardSend[2] -eq 4 -and $cardSend[3] -eq 0 -and $cardSend[4] -ge 5 -and $cardSend[4] -le 16 -and $cardSend.Length -eq 6+$cardSend[4]) -or
            ($cardSend.Length -eq 5 -and $cardSend[0] -eq 0 -and $cardSend[1] -eq 178 -and $cardSend[2] -ge 1 -and ($cardSend[3] -band 7) -eq 4 -and ($cardSend[3] -shr 3) -ge 1 -and ($cardSend[3] -shr 3) -le 30) -or
            ($cardSend.Length -eq 5 -and $cardSend[0] -eq 0 -and $cardSend[1] -eq 192 -and $cardSend[2] -eq 0 -and $cardSend[3] -eq 0) -or
            ($cardRequest.command -eq '80A8000002830000' -or $cardRequest.command -match '^80A800000483020[0-9]{3}00$') -or
            ($cardTransactional -and $cardSend.Length -ge 7 -and $cardSend[0] -eq 128 -and $cardSend[1] -eq 174 -and $cardSend[2] -eq 128 -and $cardSend[3] -eq 0 -and $cardSend[4] -ge 1 -and $cardSend.Length -eq 6+$cardSend[4] -and $cardSend[$cardSend.Length-1] -eq 0)
        if (-not $cardAllowed) { throw 'CARD_INVALID' }
        $cardPci = [PcscCardNative+IoRequest]::new()
        $cardPci.Protocol = $cardProtocol
        $cardPci.Length = 8
        [uint32]$cardSendLength = $cardSend.Length
        # T=0 case 4 sends Lc/data; GET RESPONSE retrieves returned data.
        if ($cardProtocol -eq 1 -and $cardSend.Length -gt 5) { $cardSendLength-- }
        $cardRecv = [byte[]]::new(4098)
        [uint32]$cardRecvLength = $cardRecv.Length
        try {
            if ([PcscCardNative]::SCardTransmit($cardHandle, [ref]$cardPci, $cardSend, $cardSendLength, [IntPtr]::Zero, $cardRecv, [ref]$cardRecvLength) -ne 0) { throw 'CARD_UNAVAILABLE' }
            if ($cardRecvLength -lt 2 -or $cardRecvLength -gt 4098) { throw 'CARD_INVALID' }
            @{ ok=$true; response=[BitConverter]::ToString($cardRecv, 0, $cardRecvLength).Replace('-', '') } | ConvertTo-Json -Compress
        } finally {
            [Array]::Clear($cardSend, 0, $cardSend.Length)
            [Array]::Clear($cardRecv, 0, $cardRecv.Length)
        }
    }
} catch {
    @{ ok=$false } | ConvertTo-Json -Compress
} finally {
    if ($cardHandle -ne [IntPtr]::Zero) {
        if ($cardLocked) { [PcscCardNative]::SCardEndTransaction($cardHandle, 0) | Out-Null }
        [PcscCardNative]::SCardDisconnect($cardHandle, 0) | Out-Null
    }
    if ($cardContext -ne [IntPtr]::Zero) { [PcscCardNative]::SCardReleaseContext($cardContext) | Out-Null }
}
