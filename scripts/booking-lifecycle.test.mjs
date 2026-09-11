// Run against a running local dev server: node scripts/booking-lifecycle.test.mjs
// Uses an isolated disposable workspace, never real customer appointments.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { config as env } from 'dotenv';
env({path:'.env.local',quiet:true}); env({path:'.env',quiet:true});
assert.ok(process.env.LOCAL_DATABASE_URL, 'Local database required');
const db = new PrismaClient({datasources:{db:{url:process.env.LOCAL_DATABASE_URL}}});
const slug = `schedule-test-${randomUUID()}`;
const ownerId = `test-${randomUUID()}`;
const sessionToken = randomBytes(32).toString('hex');
const url = `http://localhost:3010/api/spaces/${slug}/bookings`;
const token = () => randomBytes(32).toString('hex');
const day = new Date(Date.now()+3*86400000).toISOString().slice(0,10);
const config = {type:'scheduler',title:'Test meeting',description:'Test',durationMinutes:30,startTime:'09:00',endTime:'17:00',daysAhead:7,timeZone:'UTC',weekdays:[0,1,2,3,4,5,6],minimumNoticeHours:0,confirmationMode:'instant'};
const link = (id, quickBuild) => ({id,kind:'url',label:'Test',enabled:true,quickBuild});
const data = {settings:{enabledWorkspace:['schedule'],preChat:{links:[link('event-a',config),link('event-b',{...config,confirmationMode:'approval'})]}}};
const post = async (body, owner=false) => {
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`otgf-db=local${owner ? `; otgf_session=${sessionToken}` : ''}`},body:JSON.stringify(body)});
  return {status:res.status,body:await res.json()};
};
const input = (time, extra={}) => ({action:'create',schedulerId:'event-a',date:day,time,name:'Test Guest',email:'guest@example.test',token:token(),...extra});
try {
  await db.user.create({data:{id:ownerId,email:`${ownerId}@example.test`,passwordHash:'test-only'}});
  await db.session.create({data:{id:randomUUID(),token:createHash('sha256').update(sessionToken).digest('hex'),userId:ownerId,expiresAt:new Date(Date.now()+3600000)}});
  await db.space.create({data:{slug,ownerId,data:JSON.stringify(data)}});
  const first = input('09:00');
  const competing = input('09:00',{schedulerId:'event-b'});
  const attempts = await Promise.all([post(first),post(competing)]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,400]);
  const winner = attempts.find(r=>r.status===200).body;
  const winningInput = attempts[0].status===200 ? first : competing;
  assert.equal(winner.booking.status,winningInput.schedulerId==='event-a'?'confirmed':'requested');
  assert.equal(winner.booking.startsAt,`${day}T09:00:00.000Z`);
  assert.ok(!('managementTokenHash' in winner.booking));
  assert.equal((await post(winningInput)).body.booking.id,winner.booking.id);
  assert.equal(await db.scheduleRequest.count({where:{spaceSlug:slug}}),1);
  const access={id:winner.booking.id,token:winner.token};
  assert.equal((await post({action:'cancel',id:access.id,token:token()})).status,400);
  assert.equal((await post({action:'read',id:access.id})).status,400);
  assert.equal((await post({action:'read',id:access.id},true)).status,200);
  const busy=await post(input('10:00'));
  assert.equal(busy.status,200,JSON.stringify(busy.body));
  assert.equal(busy.body.booking.status,'confirmed');
  const failed=await post({action:'reschedule',...access,date:day,time:'10:00'});
  assert.equal(failed.status,400);
  assert.equal((await post({action:'read',...access})).body.booking.time,'09:00');
  const moved=await post({action:'reschedule',...access,date:day,time:'11:00'});
  assert.equal(moved.status,200,JSON.stringify(moved.body));
  assert.equal(moved.body.booking.time,'11:00');
  const availability=await fetch(`${url}?eventId=event-a`,{headers:{Cookie:'otgf-db=local'}}).then(r=>r.json());
  assert.ok(availability.slots[day].some(s=>s.value==='09:00'));
  assert.ok(!availability.slots[day].some(s=>s.value==='11:00'));
  assert.equal((await post({action:'cancel',...access})).body.booking.status,'canceled');
  assert.equal((await post({action:'cancel',...access})).status,200);
  assert.equal((await post({action:'reschedule',...access,date:day,time:'12:00'})).status,400);
  const pending=await post(input('11:00',{schedulerId:'event-b'}));
  assert.equal(pending.body.booking.status,'requested');
  // Restoring an overlapping declined booking must be rejected by the legacy owner API too.
  await db.scheduleRequest.update({where:{id:busy.body.booking.id},data:{status:'declined'}});
  const replacement=await post(input('10:00'));
  assert.equal(replacement.status,200);
  const opRes=await fetch(`http://localhost:3010/api/spaces/${slug}/ops`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`otgf-db=local; otgf_session=${sessionToken}`},body:JSON.stringify({type:'updateScheduleStatus',id:busy.body.booking.id,status:'confirmed'})});
  assert.equal(opRes.status,400);
  // Repeated simultaneous submissions with the same private key create just one booking.
  const retry=input('13:00');
  const retries=await Promise.all([post(retry),post(retry)]);
  assert.ok(retries.every(r=>r.status===200));
  assert.equal(retries[0].body.booking.id,retries[1].body.booking.id);
  console.log('PASS: concurrent conflicts, instant/approval modes, idempotency, private access, owner access, atomic rescheduling, cancellation, released slots, and safe status restoration');
} finally {
  await db.space.deleteMany({where:{slug}});
  await db.session.deleteMany({where:{userId:ownerId}});
  await db.user.deleteMany({where:{id:ownerId}});
  await db.$disconnect();
}
