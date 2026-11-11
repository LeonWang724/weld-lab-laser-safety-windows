export const WAVELENGTHS = [532, 1064];
export const DEFAULT_CATALOG = [532, 1064, 971, 671];
export const CHARACTERS = { green: 'Luke Skywalker', infrared: 'Darth Vader', palpatine: 'Emperor Palpatine', chewbacca: 'Chewbacca' };
export const MAX_ACTIVE = 4;
export const REPORT_TTL = 5 * 60 * 1000;
export const LINK_TTL = 3500;
export const emptyReports = (wavelengths = WAVELENGTHS) => Object.fromEntries(wavelengths.map(nm => [nm, { state: 'unknown', reportedAt: 0 }]));

export function validCharacterAssignments(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([nm, character]) =>
    String(Number(nm)) === nm && Number.isFinite(Number(nm)) && Number(nm) > 0 && Number(nm) <= 1e9 && Object.hasOwn(CHARACTERS, character));
}

export function themeForWavelength(nm, wavelengths = WAVELENGTHS, assignments = {}) {
  if (Object.hasOwn(assignments, nm) && Object.hasOwn(CHARACTERS, assignments[nm])) return assignments[nm];
  if (nm === 532) return 'green';
  if (nm === 1064) return 'infrared';
  const position = wavelengths.filter(value => !WAVELENGTHS.includes(value)).indexOf(nm);
  return position === 0 ? 'palpatine' : position === 1 ? 'chewbacca' : 'custom-channel';
}

export function normalizeWavelength(value) {
  const nm = Number(value);
  if (!Number.isFinite(nm) || nm <= 0 || nm > 1e9) throw new Error('Enter a positive wavelength in nanometers.');
  return nm;
}

export function validCatalog(values) {
  return Array.isArray(values) && values.length >= 2 && values.every(nm => typeof nm === 'number' && Number.isFinite(nm) && nm > 0 && nm <= 1e9) && new Set(values).size === values.length && WAVELENGTHS.every(nm => values.includes(nm));
}

export function canReportOn(nm, reports, mode, linkAt, wavelengths = WAVELENGTHS, now = Date.now()) {
  if (!wavelengths.includes(nm)) return false;
  return effectiveStatus(reports[nm], mode, linkAt, now) === 'on' || wavelengths.filter(value => effectiveStatus(reports[value], mode, linkAt, now) === 'on').length < MAX_ACTIVE;
}

export function effectiveStatus(report, mode, linkAt, now = Date.now()) {
  if (!report || !['on', 'off'].includes(report.state)) return 'unknown';
  if (!Number.isFinite(report.reportedAt) || now < report.reportedAt || now - report.reportedAt > REPORT_TTL) return 'unknown';
  if (mode === 'usb' && (!linkAt || now < linkAt || now - linkAt > LINK_TTL)) return 'unknown';
  return report.state;
}

export function parseBoardFrame(line, now = Date.now()) {
  if (line.length > 2048) throw new Error('Oversized board message');
  const frame = JSON.parse(line);
  if (frame.v !== 1 || !Number.isInteger(frame.uptime) || frame.uptime < 0 || frame.uptime > 0xffffffff || !Array.isArray(frame.lasers) || frame.lasers.length !== 2) throw new Error('Invalid board message');
  const reports = emptyReports();
  const seen = new Set();
  for (const laser of frame.lasers) {
    if (!WAVELENGTHS.includes(laser.nm) || seen.has(laser.nm) || ![-1, 0, 1].includes(laser.state) || !Number.isInteger(laser.changed) || laser.changed < 0 || laser.changed > 0xffffffff) throw new Error('Invalid channel');
    const age = (frame.uptime - laser.changed) >>> 0;
    seen.add(laser.nm);
    reports[laser.nm] = { state: laser.state === -1 ? 'unknown' : laser.state === 1 ? 'on' : 'off', reportedAt: now - age };
  }
  return reports;
}

export function summaryFor(states) {
  const on = states.filter(s => s === 'on').length;
  const unknown = states.filter(s => s === 'unknown').length;
  if (on) return { on, unknown, title: `${on} laser${on === 1 ? '' : 's'} reported on`, description: unknown ? `${unknown} channel unknown. Follow the lab’s entry procedure before entering.` : 'Follow the lab’s entry procedure before entering.' };
  if (unknown) return { on, unknown, title: 'Laser status unknown', description: 'Treat lasers as potentially on. Verify with the lab operator.' };
  return { on, unknown, title: 'Both lasers reported off', description: 'Operator reports only. This does not confirm that entry is safe.' };
}
