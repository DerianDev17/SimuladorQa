$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
    Add-Type -TypeDefinition @'
using System;
using System.Linq;
using System.Runtime.InteropServices;
public static class PcscMonitorNative {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct ReaderState {
        [MarshalAs(UnmanagedType.LPWStr)] public string Reader;
        public IntPtr UserData;
        public uint CurrentState, EventState, AtrLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 36)] public byte[] Atr;
    }
    [DllImport("winscard.dll")] public static extern uint SCardEstablishContext(uint scope, IntPtr a, IntPtr b, out IntPtr context);
    [DllImport("winscard.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint SCardListReadersW(IntPtr context, IntPtr groups, [Out] char[] readers, ref uint length);
    [DllImport("winscard.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint SCardGetStatusChangeW(IntPtr context, uint timeout, [In, Out] ReaderState[] readers, uint count);
    [DllImport("winscard.dll")] public static extern uint SCardReleaseContext(IntPtr context);
    public static ReaderState NewState(string name) {
        return new ReaderState { Reader = name, Atr = new byte[36] };
    }
    public static string[] Names(IntPtr context) {
        uint length = 0;
        uint code = SCardListReadersW(context, IntPtr.Zero, null, ref length);
        if (code == 0x8010002E) return new string[0];
        if (code != 0 || length < 2 || length > 4096) throw new Exception();
        char[] names = new char[length];
        if (SCardListReadersW(context, IntPtr.Zero, names, ref length) != 0) throw new Exception();
        string[] result = new string(names).Split(new char[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
        if (result.Length > 16) throw new Exception();
        return result;
    }
    public static ReaderState[] Topology(IntPtr context, ReaderState pnp) {
        return new ReaderState[] { pnp }.Concat(Names(context).Select(NewState)).ToArray();
    }
    public static void Wait(IntPtr context, ReaderState[] states, uint timeout) {
        if (SCardGetStatusChangeW(context, timeout, states, (uint)states.Length) != 0) throw new Exception();
    }
    public static void Acknowledge(ReaderState[] states) {
        for (int i = 0; i < states.Length; i++) {
            // PnP may report no status bits. Keep the acknowledged CHANGED flag
            // there so an empty baseline is not interpreted as UNAWARE again.
            states[i].CurrentState = i == 0 ? states[i].EventState | 2u : states[i].EventState;
        }
    }
}
'@ | Out-Null
    $monitorContext = [IntPtr]::Zero
    if ([PcscMonitorNative]::SCardEstablishContext(0, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$monitorContext) -ne 0) { throw 'PCSC_UNAVAILABLE' }
    try {
        # Baseline PnP before enumeration, so hotplug during enumeration is not lost.
        $monitorStates = [PcscMonitorNative+ReaderState[]]@([PcscMonitorNative]::NewState('\\?PnP?\Notification'))
        [PcscMonitorNative]::Wait($monitorContext, $monitorStates, 0)
        [PcscMonitorNative]::Acknowledge($monitorStates)
        $monitorStates = [PcscMonitorNative]::Topology($monitorContext, $monitorStates[0])
        $monitorInitial = $true
        $monitorPrevious = $null
        while ($true) {
            # An initial no-reader snapshot needs no second zero-timeout query.
            $monitorTopologyChanged = $false
            if (-not ($monitorInitial -and $monitorStates.Length -eq 1)) {
                $monitorTimeout = if ($monitorInitial) { [uint32]0 } else { [uint32]::MaxValue }
                [PcscMonitorNative]::Wait($monitorContext, $monitorStates, $monitorTimeout)
                $monitorTopologyChanged = ($monitorStates[0].EventState -band 2) -ne 0
            }
            if ($monitorTopologyChanged) {
                [PcscMonitorNative]::Acknowledge($monitorStates)
                $monitorStates = [PcscMonitorNative]::Topology($monitorContext, $monitorStates[0])
                $monitorInitial = $true
                continue
            }
            $monitorRows = @()
            $monitorCounters = @()
            for ($monitorIndex = 1; $monitorIndex -lt $monitorStates.Length; $monitorIndex++) {
                $monitorState = $monitorStates[$monitorIndex]
                $monitorPresent = ($monitorState.EventState -band 32) -ne 0
                $monitorUnavailable = ($monitorState.EventState -band 524) -ne 0
                $monitorLabel = if ($monitorUnavailable) { 'UNAVAILABLE' } elseif ($monitorPresent) { 'CARD_PRESENT' } else { 'EMPTY' }
                $monitorAtr = $null
                if ($monitorPresent -and -not $monitorUnavailable -and $monitorState.AtrLength -gt 0) {
                    if ($monitorState.AtrLength -gt 36) { throw 'PCSC_UNAVAILABLE' }
                    $monitorAtr = [BitConverter]::ToString($monitorState.Atr, 0, $monitorState.AtrLength).Replace('-', '')
                }
                $monitorRows += [ordered]@{ name = $monitorState.Reader; state = $monitorLabel; atr = $monitorAtr }
                $monitorCounters += ($monitorState.EventState -shr 16)
            }
            $monitorJson = [ordered]@{ ok = $true; readers = @($monitorRows) } | ConvertTo-Json -Depth 4 -Compress
            # IN_USE/EXCLUSIVE changes alone must not flicker or clear a manual read.
            $monitorSignature = $monitorJson + ($monitorCounters -join ',')
            if ($monitorSignature -cne $monitorPrevious) {
                [Console]::WriteLine($monitorJson)
                [Console]::Out.Flush()
                $monitorPrevious = $monitorSignature
            }
            [PcscMonitorNative]::Acknowledge($monitorStates)
            $monitorInitial = $false
        }
    } finally { [PcscMonitorNative]::SCardReleaseContext($monitorContext) | Out-Null }
} catch {
    [Console]::WriteLine('{"ok":false,"code":"PCSC_UNAVAILABLE"}')
}
