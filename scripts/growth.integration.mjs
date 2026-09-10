import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { newGrowthData } from '../src/lib/growth.ts';
config({path:'.env.local',quiet:true});
const url=process.env.LOCAL_DATABASE_URL;
if (!url) throw new Error('Local database required.');
const db=new PrismaClient({datasources:{db:{url}}});
const id=randomUUID(); const slug=`growth-test-${id.slice(0,16)}`; const token=randomUUID();
const cookie=`otgf_session=${token}; otgf-db=local`;
const base='http://localhost:3010';
async function request(path,body,authenticated=true,expected=200) {
  const response=await fetch(`${base}${path}`,{method:body?'POST':'GET',headers:{...(authenticated?{cookie}: {'cookie':'otgf-db=local'}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const data=await response.json();
  assert.equal(response.status,expected,JSON.stringify(data)); return data;
}
const endpoint=`/api/spaces/${slug}/growth`;
const save=(kind,data,record)=>request(endpoint,{kind,data,id:record?.id,version:record?.version});
try {
  await db.user.create({data:{id,email:`${id}@example.test`,passwordHash:'test-only-not-a-password'}});
  await db.session.create({data:{id,token:createHash('sha256').update(token).digest('hex'),userId:id,expiresAt:new Date(Date.now()+600000)}});
  await db.space.create({data:{slug,ownerId:id,data:JSON.stringify({business:{name:'Growth test',slug},settings:{enabledWorkspace:['referrals','affiliates','storytelling']}})}});
  await request(endpoint,undefined,false,401);
  let program=await save('affiliate',{...newGrowthData('affiliate'),title:'Test partner program',status:'active',rewardType:'percent',reward:10});
  const partner=await save('partner',{...newGrowthData('partner'),title:'Test partner',email:'private@example.test',programId:program.id});
  const publicData=await request(`/api/growth/${partner.id}`,undefined,false);
  assert.equal(publicData.title,'Test partner program'); assert.equal(JSON.stringify(publicData).includes('private@example.test'),false);
  await request(`/api/growth/${partner.id}`,{action:'visit'},false);
  await request(`/api/growth/${partner.id}`,{action:'lead',name:'Test lead',email:'lead@example.test',message:'A question'},false);
  await request(`/api/growth/${partner.id}`,{action:'lead',name:'Test lead',email:'lead@example.test',message:'Retry'},false);
  let records=await request(endpoint); assert.equal(records.filter(r=>r.kind==='conversion').length,1);
  assert.equal(records.find(r=>r.id===partner.id).visits,1);
  let lead=records.find(r=>r.kind==='conversion');
  lead=await save('conversion',{...lead.data,status:'confirmed',amount:250,reference:'ORDER-1'},lead); assert.equal(lead.data.commission,25);
  program=await save('affiliate',{...program.data,reward:20},program);
  lead=await save('conversion',{...lead.data,status:'paid'},lead); assert.equal(lead.data.commission,25);
  await request(endpoint,{kind:'conversion',id:lead.id,version:lead.version,data:{...lead.data,amount:300}},true,400);
  await request(endpoint,{kind:'affiliate',id:program.id,version:1,data:program.data},true,400);
  await request(endpoint,{kind:'affiliate',id:program.id,version:program.version,data:{...program.data,currency:'EUR'}},true,400);
  await save('affiliate',{...program.data,status:'paused'},program);
  await request(`/api/growth/${partner.id}`,undefined,false,404);
  let story=await save('story',{...newGrowthData('story'),title:'Test story',challenge:'Before',process:'Work',outcome:'After'});
  await request(`/api/growth/${story.id}`,undefined,false,404);
  story=await save('story',{...story.data,status:'published'},story);
  assert.equal((await request(`/api/growth/${story.id}`,undefined,false)).outcome,'After');
  await save('story',{...story.data,status:'draft'},story);
  await request(`/api/growth/${story.id}`,undefined,false,404);
  const referral=await save('referral',{...newGrowthData('referral'),title:'Referral',status:'active',reward:15});
  const referrer=await save('partner',{...newGrowthData('partner'),title:'Referrer',programId:referral.id});
  const conversion=await save('conversion',{...newGrowthData('conversion'),title:'Manual sale',programId:referral.id,partnerId:referrer.id,status:'confirmed',amount:100});
  assert.equal(conversion.data.commission,15);
  console.log('PASS: authenticated CRUD, private fields, tracking, duplicate leads, attribution, commission snapshots, paid locks, version conflicts, currency locks, paused links, and story publication.');
} finally {
  await db.space.deleteMany({where:{slug}});
  await db.user.deleteMany({where:{id}});
  await db.$disconnect();
}
