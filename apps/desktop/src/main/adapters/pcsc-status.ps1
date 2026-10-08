$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PcscStatusNative {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct ReaderState {
        [MarshalAs(UnmanagedType.LPWStr)] public string Reader;
        public IntPtr UserData;
        public uint CurrentState;
        public uint EventState;
        public uint AtrLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 36)] public byte[] Atr;
    }
    [DllImport("winscard.dll")] public static extern uint SCardEstablishContext(uint scope, IntPtr reserved1, IntPtr reserved2, out IntPtr context);
    [DllImport("winscard.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern uint SCardListReadersW(IntPtr context, IntPtr groups, [Out] char[] readers, ref uint length);
    [DllImport("winscard.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern uint SCardGetStatusChangeW(IntPtr context, uint timeout, [In, Out] ReaderState[] readers, uint count);
    [DllImport("winscard.dll")] public static extern uint SCardReleaseContext(IntPtr context);
}
'@ | Out-Null
    $pcscContext = [IntPtr]::Zero
    if ([PcscStatusNative]::SCardEstablishContext(0, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$pcscContext) -ne 0) { throw 'PCSC_UNAVAILABLE' }
    try {
        [uint32]$pcscLength = 0
        $pcscCode = [PcscStatusNative]::SCardListReadersW($pcscContext, [IntPtr]::Zero, $null, [ref]$pcscLength)
        if ($pcscCode -eq 2148532270) {
            @{ ok = $true; readers = @() } | ConvertTo-Json -Compress
        } else {
            if ($pcscCode -ne 0 -or $pcscLength -gt 4096 -or $pcscLength -lt 2) { throw 'PCSC_UNAVAILABLE' }
            $pcscNamesBuffer = [char[]]::new($pcscLength)
            if ([PcscStatusNative]::SCardListReadersW($pcscContext, [IntPtr]::Zero, $pcscNamesBuffer, [ref]$pcscLength) -ne 0) { throw 'PCSC_UNAVAILABLE' }
            $pcscNames = @((-join $pcscNamesBuffer).Split([char[]]@([char]0), [StringSplitOptions]::RemoveEmptyEntries))
            if ($pcscNames.Count -gt 16) { throw 'PCSC_UNAVAILABLE' }
            $pcscStates = [PcscStatusNative+ReaderState[]]::new($pcscNames.Count)
            for ($pcscIndex = 0; $pcscIndex -lt $pcscNames.Count; $pcscIndex++) {
                $pcscReaderState = [PcscStatusNative+ReaderState]::new()
                $pcscReaderState.Reader = $pcscNames[$pcscIndex]
                $pcscReaderState.Atr = [byte[]]::new(36)
                $pcscStates[$pcscIndex] = $pcscReaderState
            }
            # Immediate status observation: no APDU, connection/reset or card writes.
            if ([PcscStatusNative]::SCardGetStatusChangeW($pcscContext, 0, $pcscStates, $pcscStates.Count) -ne 0) { throw 'PCSC_UNAVAILABLE' }
            $pcscRows = @()
            foreach ($pcscState in $pcscStates) {
                $pcscPresent = ($pcscState.EventState -band 32) -ne 0
                $pcscUnavailable = ($pcscState.EventState -band 524) -ne 0
                $pcscLabel = if ($pcscUnavailable) { 'UNAVAILABLE' } elseif ($pcscPresent) { 'CARD_PRESENT' } else { 'EMPTY' }
                $pcscAtr = $null
                if ($pcscPresent -and -not $pcscUnavailable -and $pcscState.AtrLength -gt 0) {
                    if ($pcscState.AtrLength -gt 36) { throw 'PCSC_UNAVAILABLE' }
                    $pcscAtr = [BitConverter]::ToString($pcscState.Atr, 0, $pcscState.AtrLength).Replace('-', '')
                }
                $pcscRows += @{ name = $pcscState.Reader; state = $pcscLabel; atr = $pcscAtr }
                [Array]::Clear($pcscState.Atr, 0, $pcscState.Atr.Length)
            }
            @{ ok = $true; readers = @($pcscRows) } | ConvertTo-Json -Depth 4 -Compress
        }
    } finally {
        [PcscStatusNative]::SCardReleaseContext($pcscContext) | Out-Null
    }
} catch {
    @{ ok = $false; code = 'PCSC_UNAVAILABLE' } | ConvertTo-Json -Compress
}
