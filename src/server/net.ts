import os from 'node:os';

const VIRTUAL = /(vethernet|virtualbox|vmware|wsl|hyper-v|loopback|docker|tailscale|zerotier|radmin|hamachi)/i;

function score(name: string, ip: string): number {
  let s = 0;
  if (VIRTUAL.test(name)) s -= 10;
  if (/^192\.168\./.test(ip)) s += 3;
  else if (/^10\./.test(ip)) s += 2;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) s += 1;
  if (/wi-?fi|wlan|wireless|ethernet|en\d|eth\d/i.test(name)) s += 1;
  return s;
}

/** LAN IPv4 addresses, most likely "real" network first. */
export function lanAddresses(): string[] {
  const found: { ip: string; s: number }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) found.push({ ip: a.address, s: score(name, a.address) });
    }
  }
  return found.sort((a, b) => b.s - a.s).map((f) => f.ip);
}
