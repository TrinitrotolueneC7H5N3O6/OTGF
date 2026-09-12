import test from 'node:test';
import assert from 'node:assert/strict';
import { newGrowthData, validateGrowthData, commissionFor, growthMetrics } from '../src/lib/growth.ts';
import { normalizeStoryTemplate } from '../src/lib/storytelling.ts';

test('validates program rates, amounts, status, and currency', () => {
  const data = {...newGrowthData('affiliate'), title:'Partner program', rewardType:'percent', reward:15};
  assert.equal(validateGrowthData('affiliate', data).reward, 15);
  for (const change of [{reward:101}, {reward:-1}, {amount:NaN}, {status:'published'}, {currency:'invalid'}]) assert.throws(() => validateGrowthData('affiliate', {...data,...change}));
  assert.equal(commissionFor(199.99,data), 30);
  assert.equal(commissionFor(199.99,{...data,rewardType:'fixed',reward:12.5}),12.5);
});
test('only complete stories may be published', () => {
  const story = {...newGrowthData('story'),title:'Project',status:'published'};
  assert.throws(() => validateGrowthData('story',story));
  assert.equal(validateGrowthData('story',{...story,challenge:'Before',process:'Work',outcome:'After'}).status,'published');
  assert.equal(validateGrowthData('story',{...story,status:'draft'}).status,'draft');
  assert.equal(validateGrowthData('story',{...story,challenge:'',process:'',outcome:'',chapters:{situation:'Before',work:'Work',result:'After'}}).chapters.result,'After');
  const photo = normalizeStoryTemplate({ format: 'photo' });
  assert.throws(() => validateGrowthData('story', {...story, chapters: { caption: 'Fixed it.' }}, photo));
  const published = validateGrowthData('story', {
    ...story,
    title: '',
    photos: ['https://example.com/before.jpg', 'https://example.com/after.jpg'],
    chapters: { caption: 'The pipe burst. We replaced the valve.' },
  }, photo);
  assert.equal(published.title, 'The pipe burst');
  assert.equal(published.chapters.caption.includes('valve'), true);
});
test('monitoring excludes rejected leads and separates owed from paid rewards', () => {
  const record = (status,amount,commission) => ({kind:'conversion',data:{...newGrowthData('conversion'),programId:'p',status,amount,commission}});
  const records = [record('lead',100,10),record('confirmed',200,20),record('paid',300,30),record('rejected',400,40),{kind:'partner',visits:9,data:{programId:'p'}}];
  assert.deepEqual(growthMetrics(records,'p'),{partners:1,visits:9,leads:3,confirmed:2,revenue:500,owed:20,paid:30});
  assert.equal(growthMetrics(records,'other').revenue,0);
});
