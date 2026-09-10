import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleDates, scheduleSlots, scheduleInstant } from '../src/lib/scheduling.ts';

const config = { type: 'scheduler', title: 'Meeting', description: '', durationMinutes: 30, startTime: '09:00', endTime: '10:00', daysAhead: 7, weekdays: [1,2,3,4,5], timeZone: 'America/Los_Angeles', minimumNoticeHours: 2 };
const now = Date.parse('2026-09-09T15:30:00Z'); // Wednesday, 8:30 AM Pacific.
test('weekly availability and booking window exclude weekends and out-of-range days', () => {
  assert.deepEqual(scheduleDates(config, now).map(d => d.value), ['2026-09-09','2026-09-10','2026-09-11','2026-09-14','2026-09-15']);
  assert.deepEqual(scheduleSlots(config, '2026-09-12', now), []);
  assert.deepEqual(scheduleSlots(config, '2026-09-16', now), []);
});
test('notice excludes last-minute slots and duration fits within closing time', () => {
  assert.deepEqual(scheduleSlots(config, '2026-09-09', now), []);
  assert.deepEqual(scheduleSlots(config, '2026-09-10', now).map(s => s.value), ['09:00','09:30']);
  assert.deepEqual(scheduleSlots({...config, durationMinutes:45}, '2026-09-10', now).map(s=>s.value), ['09:00']);
});
test('closed schedules and reversed hours offer no slots', () => {
  assert.deepEqual(scheduleSlots({...config, weekdays:[]}, '2026-09-10', now), []);
  assert.deepEqual(scheduleSlots({...config, endTime:'08:00'}, '2026-09-10', now), []);
});
test('time zones handle summer, winter, fractional offsets and skipped DST hours', () => {
  assert.equal(new Date(scheduleInstant('2026-09-10','09:00','America/Los_Angeles')).toISOString(), '2026-09-10T16:00:00.000Z');
  assert.equal(new Date(scheduleInstant('2026-12-10','09:00','America/Los_Angeles')).toISOString(), '2026-12-10T17:00:00.000Z');
  assert.equal(new Date(scheduleInstant('2026-09-10','09:00','Asia/Kolkata')).toISOString(), '2026-09-10T03:30:00.000Z');
  assert.ok(Number.isNaN(scheduleInstant('2026-03-08','02:30','America/Los_Angeles')));
});
