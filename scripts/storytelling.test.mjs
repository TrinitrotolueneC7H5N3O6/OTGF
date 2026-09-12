import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultStoryTemplate,
  matchStorySearch,
  normalizeStoryTemplate,
  requiredChaptersFilled,
  storyHaystack,
  applyStoryStyleTemplate,
  matchingStoryStyleId,
  STORY_STYLE_TEMPLATES,
} from '../src/lib/storytelling.ts';

test('story templates keep two to five named parts and fill missing labels', () => {
  const raw = {
    voice: 'warm',
    titleStyle: 'problem',
    photoStyle: 'beforeAfter',
    showDate: false,
    eyebrow: 'From the shop',
    searchPrompt: 'Try leak',
    sections: [
      { id: 'situation', label: '', prompt: 'What was wrong?', required: true },
      { id: 'work', label: 'The fix', prompt: 'What did you do?', required: true },
    ],
  };
  const template = normalizeStoryTemplate(raw);
  assert.equal(template.format, 'writing');
  assert.equal(template.voice, 'warm');
  assert.equal(template.photoStyle, 'beforeAfter');
  assert.equal(template.sections[0].label, 'Part 1');
  assert.equal(template.sections.length, 2);
  assert.equal(normalizeStoryTemplate({ sections: [{ id: 'only' }] }).sections.length, 3);
});

test('photo stories keep a single caption part', () => {
  const template = normalizeStoryTemplate({ format: 'photo' });
  assert.equal(template.format, 'photo');
  assert.equal(template.photoStyle, 'beforeAfter');
  assert.equal(template.sections.length, 1);
  assert.equal(template.sections[0].id, 'caption');
  assert.equal(requiredChaptersFilled(template, { caption: 'Fixed the leak.' }), true);
  assert.equal(requiredChaptersFilled(template, { caption: '' }), false);
});

test('customers match stories by every search word across title, tags, and chapters', () => {
  const haystack = storyHaystack({
    title: 'Upstairs AC',
    description: '',
    tags: ['cooling', 'filter'],
    chapters: { situation: 'Rooms were blowing warm air', work: 'Replaced the capacitor', result: 'House holds 72' },
  });
  assert.equal(matchStorySearch(haystack, 'warm ac'), true);
  assert.equal(matchStorySearch(haystack, 'furnace leak'), false);
  assert.equal(matchStorySearch(haystack, ''), true);
});

test('required chapters must be filled before a story can publish', () => {
  const template = defaultStoryTemplate();
  assert.equal(requiredChaptersFilled(template, { situation: 'a', work: 'b', result: 'c' }), true);
  assert.equal(requiredChaptersFilled(template, { situation: 'a', work: '', result: 'c' }), false);
});

test('list layout and output normalize independently of story format', () => {
  for (const format of ['photo', 'writing']) {
    for (const listLayout of ['feed', 'grid', 'compact']) {
      for (const output of ['website', 'embed', 'carousel']) {
        const template = normalizeStoryTemplate({ format, listLayout, output });
        assert.equal(template.format, format);
        assert.equal(template.listLayout, listLayout);
        assert.equal(template.output, output);
        assert.deepEqual(normalizeStoryTemplate(JSON.parse(JSON.stringify(template))), template);
      }
    }
  }
});

test('legacy templates retain the feed and website defaults', () => {
  const template = normalizeStoryTemplate({ format: 'photo', listLayout: 'invalid', output: 'invalid' });
  assert.equal(template.listLayout, 'feed');
  assert.equal(template.output, 'website');
});

test('repairing incomplete story sections does not reset presentation choices', () => {
  const template = normalizeStoryTemplate({ format: 'writing', sections: [], listLayout: 'compact', output: 'carousel', showDate: false });
  assert.equal(template.sections.length, 3);
  assert.equal(template.listLayout, 'compact');
  assert.equal(template.output, 'carousel');
  assert.equal(template.showDate, false);
});

test('story style templates apply listing and format while keeping output', () => {
  const current = normalizeStoryTemplate({ format: 'writing', output: 'embed', listLayout: 'feed' });
  const applied = applyStoryStyleTemplate(current, 'before-after');
  assert.ok(applied);
  assert.equal(applied.format, 'photo');
  assert.equal(applied.photoStyle, 'beforeAfter');
  assert.equal(applied.listLayout, 'grid');
  assert.equal(applied.output, 'embed');
  assert.equal(matchingStoryStyleId(applied), 'before-after');
  assert.equal(STORY_STYLE_TEMPLATES.length >= 4, true);
  assert.equal(applyStoryStyleTemplate(current, 'missing'), null);
});
