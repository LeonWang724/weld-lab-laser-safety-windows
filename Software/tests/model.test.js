import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveStatus, parseBoardFrame, summaryFor, REPORT_TTL, LINK_TTL, emptyReports, canReportOn, normalizeWavelength, validCatalog, themeForWavelength, validCharacterAssignments } from '../dist/model.js';

test('each wavelength can use any of the four characters without changing its report', () => {
  const catalog=[532,1064,971,671], reports=emptyReports(catalog);
  for (const nm of catalog) for (const character of ['green','infrared','palpatine','chewbacca']) {
    assert.equal(themeForWavelength(nm,catalog,{[nm]:character}),character);
    assert.equal(reports[nm].state,'unknown');
  }
  assert.equal(themeForWavelength(532,catalog,{532:'not-a-character'}),'green');
});

test('saved character choices reject unknown characters and invalid wavelength keys', () => {
  assert.equal(validCharacterAssignments({532:'chewbacca',1064:'green',971:'infrared',671:'palpatine'}),true);
  assert.equal(validCharacterAssignments({'632.8':'green'}),true);
  for (const value of [null,[],{532:'unknown'},{532:'constructor'},{zero:'green'},{'-1':'infrared'},{'0532':'palpatine'},{'1e50':'green'}]) {
    assert.equal(validCharacterAssignments(value),false);
  }
});

test('custom character themes follow addition order, independently of wavelength numbers', () => {
  for (const catalog of [[532,1064,405,1550], [532,1064,632.8,780]]) {
    assert.equal(themeForWavelength(532, catalog), 'green');
    assert.equal(themeForWavelength(1064, catalog), 'infrared');
    assert.equal(themeForWavelength(catalog[2], catalog), 'palpatine');
    assert.equal(themeForWavelength(catalog[3], catalog), 'chewbacca');
    assert.equal(themeForWavelength(999, [...catalog,999]), 'custom-channel');
  }
});

test('sample mode can no longer bypass report expiry', () => {
  assert.equal(effectiveStatus({state:'on',reportedAt:0}, 'preview', 0, REPORT_TTL + 1), 'unknown');
});

test('missing reports, expired reports, and future timestamps remain unknown', () => {
  const now = 900000;
  assert.equal(effectiveStatus(null, 'manual', 0, now), 'unknown');
  assert.equal(effectiveStatus({ state: 'off', reportedAt: now - REPORT_TTL - 1 }, 'manual', 0, now), 'unknown');
  assert.equal(effectiveStatus({ state: 'on', reportedAt: now + 1 }, 'manual', 0, now), 'unknown');
  assert.equal(effectiveStatus({ state: 'off', reportedAt: now - 10 }, 'manual', 0, now), 'off');
});
test('USB heartbeat cannot keep an old operator report current', () => {
  const now = 900000;
  assert.equal(effectiveStatus({ state: 'off', reportedAt: now - REPORT_TTL - 1 }, 'usb', now, now), 'unknown');
  assert.equal(effectiveStatus({ state: 'off', reportedAt: now - 100 }, 'usb', now - LINK_TTL - 1, now), 'unknown');
  assert.equal(effectiveStatus({ state: 'on', reportedAt: now - 100 }, 'usb', now, now), 'on');
});
test('board messages preserve operator report age, including millis rollover', () => {
  const reports = parseBoardFrame(JSON.stringify({ v: 1, uptime: 10000, lasers: [{ nm: 532, state: 1, changed: 4000 }, { nm: 1064, state: -1, changed: 0 }] }), 100000);
  assert.equal(reports[532].reportedAt, 94000);
  assert.equal(reports[1064].state, 'unknown');
  const rolled = parseBoardFrame(JSON.stringify({ v: 1, uptime: 100, lasers: [{ nm: 532, state: 0, changed: 0xfffffff0 }, { nm: 1064, state: -1, changed: 0 }] }), 1000);
  assert.equal(rolled[532].reportedAt, 884);
});
test('partial, duplicate, and malformed board frames are rejected', () => {
  for (const lasers of [[], [{ nm: 532, state: 1, changed: 0 }], [{ nm: 532, state: 1, changed: 0 }, { nm: 532, state: 0, changed: 0 }], [{ nm: 532, state: 8, changed: 0 }, { nm: 1064, state: 0, changed: 0 }]]) {
    assert.throws(() => parseBoardFrame(JSON.stringify({ v: 1, uptime: 1000, lasers })));
  }
  assert.throws(() => parseBoardFrame('{broken'));
  assert.throws(() => parseBoardFrame('x'.repeat(2049)));
});
test('unknown channels never produce an all-off summary', () => {
  assert.equal(summaryFor(['unknown', 'off']).title, 'Laser status unknown');
  assert.equal(summaryFor(['on', 'unknown']).unknown, 1);
  assert.match(summaryFor(['off', 'off']).description, /does not confirm/);
});

test('four active lasers block a fifth while allowing reconfirmation and OFF', () => {
  const catalog = [532, 1064, 405, 780, 1550];
  const reports = emptyReports(catalog), now = 900000;
  for (const nm of catalog.slice(0, 4)) reports[nm] = { state: 'on', reportedAt: now };
  assert.equal(canReportOn(1550, reports, 'manual', 0, catalog, now), false);
  assert.equal(canReportOn(532, reports, 'manual', 0, catalog, now), true);
  reports[405] = { state: 'off', reportedAt: now };
  assert.equal(canReportOn(1550, reports, 'manual', 0, catalog, now), true);
  assert.equal(canReportOn(800, reports, 'manual', 0, catalog, now), false);
});

test('catalogs preserve defaults and validate custom wavelengths', () => {
  assert.equal(normalizeWavelength('632.8'), 632.8);
  for (const value of ['', '-1', '0', 'text', Infinity]) assert.throws(() => normalizeWavelength(value));
  assert.equal(validCatalog([532, 1064, 780, 632.8]), true);
  assert.equal(validCatalog([532, 1064, 780, 780]), false);
  assert.equal(validCatalog([532, 780]), false);
  assert.equal(validCatalog([532, 1064, -780]), false);
});
