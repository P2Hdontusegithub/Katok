import { execFile } from 'node:child_process';

export const FIREWALL_RULE = 'Ka-tok';

export interface FirewallStatus {
  /** An enabled inbound "Allow" rule covers this port or node.exe on the active network profile. */
  allowed: boolean;
  /** An enabled inbound "Block" rule targets node.exe (created when the Windows prompt was cancelled). */
  blocked: boolean;
  /** Active network profile(s), e.g. "Public". */
  profiles: string[];
  /**
   * Third-party firewalls registered with Windows Security (e.g. Symantec
   * Endpoint Protection). When present they replace Windows Firewall, so its
   * rules — and `allowed` above — say nothing about whether phones get through.
   */
  thirdParty: string[];
}

/**
 * Windows only: checks whether phones on the LAN can reach the server.
 * Resolves null on other platforms or when the check itself fails.
 */
export function checkFirewall(port: number): Promise<FirewallStatus | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const node = process.execPath.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$profiles = @(Get-NetConnectionProfile | ForEach-Object { [string]$_.NetworkCategory } | Where-Object { $_ -ne 'DomainAuthenticated' }) + @(Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'DomainAuthenticated' } | ForEach-Object { 'Domain' })
$fw = Get-NetFirewallProfile | Where-Object { $profiles -contains $_.Name }
$off = @($fw | Where-Object { -not $_.Enabled }).Count -eq @($fw).Count -and @($fw).Count -gt 0
function Hits($r) { $p = [string]$r.Profile; if ($p -eq 'Any') { return $true }; foreach ($x in $profiles) { if ($p -match $x) { return $true } }; return $false }
# Filters are fetched in bulk: querying them rule by rule takes tens of seconds.
$rules = @{}
foreach ($r in (Get-NetFirewallRule -Enabled True -Direction Inbound)) { if (Hits $r) { $rules[$r.Name] = $r } }
$apps = @{}
foreach ($f in (Get-NetFirewallApplicationFilter)) { if ($rules.ContainsKey($f.InstanceID)) { $apps[$f.InstanceID] = [string]$f.Program } }
$allow = $false; $block = $false
foreach ($name in @($apps.Keys)) {
  if ($apps[$name] -ine '${node}') { continue }
  if ($rules[$name].Action -eq 'Block') { $block = $true } elseif ($rules[$name].Action -eq 'Allow') { $allow = $true }
}
# Without admin rights the bulk listing can stop half-way ("Access is denied"),
# so Allow rules not bound to a program and missing from it are queried one by one.
$ports = @{}
foreach ($pf in (Get-NetFirewallPortFilter -ErrorAction SilentlyContinue)) { if ($rules.ContainsKey($pf.InstanceID)) { $ports[$pf.InstanceID] = $pf } }
foreach ($name in @($rules.Keys)) {
  $app = $apps[$name]
  if ($ports.ContainsKey($name) -or $rules[$name].Action -ne 'Allow' -or ($app -and $app -ne 'Any')) { continue }
  $pf = $rules[$name] | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
  if ($pf) { $ports[$name] = $pf }
}
foreach ($pf in $ports.Values) {
  $r = $rules[$pf.InstanceID]
  if (-not $r -or $r.Action -ne 'Allow') { continue }
  $app = $apps[$pf.InstanceID]
  if ($app -and $app -ne 'Any') { continue }
  if (($pf.Protocol -eq 'TCP' -or $pf.Protocol -eq 'Any') -and (@($pf.LocalPort) -contains '${port}')) { $allow = $true }
}
if ($off) { $allow = $true }
# Bits 12-13 of productState = 01 means the product is switched on.
$third = @(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName FirewallProduct | Where-Object { (($_.productState -shr 12) -band 3) -eq 1 } | ForEach-Object { [string]$_.displayName })
@{ allowed = $allow; blocked = $block; profiles = $profiles; thirdParty = $third } | ConvertTo-Json -Compress`;
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 45000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const r = JSON.parse(stdout.trim());
          resolve({
            allowed: !!r.allowed,
            blocked: !!r.blocked,
            profiles: ([] as string[]).concat(r.profiles ?? []),
            thirdParty: ([] as string[]).concat(r.thirdParty ?? []).filter(Boolean),
          });
        } catch {
          resolve(null);
        }
      },
    );
  });
}
