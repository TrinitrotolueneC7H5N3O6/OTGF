import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleDates, scheduleSlots, scheduleInstant, composeBookingNotes } from '../src/lib/scheduling.ts';

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

test('split hours, independent intervals and date overrides', () => {
  const flexible = { ...config, slotIntervalMinutes: 15, weeklyHours: { 4: [{start:'09:00',end:'10:00'},{start:'13:00',end:'14:00'}] }, dateOverrides: {'2026-09-11':[], '2026-09-12':[{start:'11:00',end:'12:00'}]} };
  assert.deepEqual(scheduleSlots(flexible,'2026-09-10',now).map(s=>s.value), ['09:00','09:15','09:30','13:00','13:15','13:30']);
  assert.deepEqual(scheduleSlots(flexible,'2026-09-11',now), []);
  assert.deepEqual(scheduleSlots(flexible,'2026-09-12',now).map(s=>s.value), ['11:00','11:15','11:30']);
});
test('busy appointments, pending reservations and buffers block across event types', () => {
  const busy = [{ date:'2026-09-10', time:'09:00', durationMinutes:30, timeZone:config.timeZone, status:'confirmed', bufferAfterMinutes:15 }];
  assert.deepEqual(scheduleSlots(config,'2026-09-10',now,busy), []);
  assert.deepEqual(scheduleSlots(config,'2026-09-10',now,[{...busy[0],bufferAfterMinutes:0}]).map(s=>s.value), ['09:30']);
  assert.deepEqual(scheduleSlots(config,'2026-09-10',now,[{...busy[0],status:'requested'}]), []);
  for (const status of ['canceled','declined']) assert.equal(scheduleSlots(config,'2026-09-10',now,[{...busy[0],status}]).length,2);
});
test('daily limits count active bookings in the event timezone', () => {
  const busy = [{date:'2026-09-10',time:'16:00',timeZone:'UTC',durationMinutes:30,status:'confirmed'}];
  assert.deepEqual(scheduleSlots({...config,dailyLimit:1},'2026-09-10',now,busy), []);
});
test('overlapping hour ranges deduplicate slots and stored instants survive timezone changes', () => {
  const duplicate = {...config, weeklyHours:{4:[{start:'09:00',end:'10:00'},{start:'09:00',end:'10:00'}]}};
  assert.equal(scheduleSlots(duplicate,'2026-09-10',now).length,2);
  const busy = [{date:'2026-09-10',time:'09:00',timeZone:'UTC',startsAt:'2026-09-10T16:00:00Z',endsAt:'2026-09-10T16:30:00Z',durationMinutes:30,status:'confirmed'}];
  assert.deepEqual(scheduleSlots(config,'2026-09-10',now,busy).map(s=>s.value), ['09:30']);
});
test('booking choice notes require a listed option and prepend the question', () => {
  const withChoices = {...config, choicePrompt:'Service', choiceOptions:['Tune-up','Repair']};
  assert.equal(composeBookingNotes(config,'Tune-up','Please call'), 'Please call');
  assert.equal(composeBookingNotes(withChoices,'Tune-up','Please call'), 'Service: Tune-up\n\nPlease call');
  assert.equal(composeBookingNotes(withChoices,'Tune-up',''), 'Service: Tune-up');
  assert.equal(composeBookingNotes(withChoices,'Install',''), null);
});
