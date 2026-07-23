const { spawnSync } = require("child_process");

const WINDOWS_SUSPEND_RESUME_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class ProcessThreadControl
{
    [Flags]
    public enum ThreadAccess : int
    {
        SUSPEND_RESUME = 0x0002
    }

    [DllImport("kernel32.dll")]
    private static extern IntPtr OpenThread(ThreadAccess desiredAccess, bool inheritHandle, uint threadId);

    [DllImport("kernel32.dll")]
    private static extern uint SuspendThread(IntPtr threadHandle);

    [DllImport("kernel32.dll")]
    private static extern int ResumeThread(IntPtr threadHandle);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    public static void SuspendProcess(int processId)
    {
        Process process = Process.GetProcessById(processId);
        foreach (ProcessThread thread in process.Threads)
        {
            IntPtr threadHandle = OpenThread(ThreadAccess.SUSPEND_RESUME, false, (uint)thread.Id);
            if (threadHandle == IntPtr.Zero)
            {
                continue;
            }

            try
            {
                SuspendThread(threadHandle);
            }
            finally
            {
                CloseHandle(threadHandle);
            }
        }
    }

    public static void ResumeProcess(int processId)
    {
        Process process = Process.GetProcessById(processId);
        foreach (ProcessThread thread in process.Threads)
        {
            IntPtr threadHandle = OpenThread(ThreadAccess.SUSPEND_RESUME, false, (uint)thread.Id);
            if (threadHandle == IntPtr.Zero)
            {
                continue;
            }

            try
            {
                while (ResumeThread(threadHandle) > 0)
                {
                }
            }
            finally
            {
                CloseHandle(threadHandle);
            }
        }
    }
}
"@

$operation = $args[0]
$processId = [int]$args[1]

if ($operation -eq 'suspend') {
    [ProcessThreadControl]::SuspendProcess($processId)
    exit 0
}

if ($operation -eq 'resume') {
    [ProcessThreadControl]::ResumeProcess($processId)
    exit 0
}

throw "Unsupported process control operation: $operation"
`;

function suspendProcess(pid) {
    if (!isValidPid(pid)) {
        throw new Error("suspendProcess requires a valid pid");
    }

    if (process.platform === "win32") {
        runWindowsProcessControl("suspend", pid);
        return true;
    }

    process.kill(pid, "SIGSTOP");
    return true;
}

function resumeProcess(pid) {
    if (!isValidPid(pid)) {
        throw new Error("resumeProcess requires a valid pid");
    }

    if (process.platform === "win32") {
        runWindowsProcessControl("resume", pid);
        return true;
    }

    process.kill(pid, "SIGCONT");
    return true;
}

function terminateProcess(pid) {
    if (!isValidPid(pid)) {
        return false;
    }

    if (process.platform === "win32") {
        process.kill(pid);
        return true;
    }

    process.kill(pid, "SIGKILL");
    return true;
}

function runWindowsProcessControl(operation, pid) {
    const command = Buffer.from(WINDOWS_SUSPEND_RESUME_SCRIPT, "utf16le").toString("base64");
    const result = spawnSync("powershell.exe", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-EncodedCommand", command,
        operation,
        String(pid)
    ], {
        encoding: "utf8"
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        const details = String(result.stderr || result.stdout || "").trim() || `exit code ${result.status}`;
        throw new Error(`Windows process ${operation} failed for pid ${pid}: ${details}`);
    }
}

function isValidPid(pid) {
    return Number.isInteger(pid) && pid > 0;
}

module.exports = {
    suspendProcess,
    resumeProcess,
    terminateProcess
};
