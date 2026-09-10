import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultStoryTemplate,
  matchStorySearch,
  normalizeStoryTemplate,
  requiredChaptersFilled,
  storyHaystack,
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
  assert.equal(template.voice, 'warm');
  assert.equal(template.photoStyle, 'beforeAfter');
  assert.equal(template.sections[0].label, 'Part 1');
  assert.equal(template.sections.length, 2);
  assert.equal(normalizeStoryTemplate({ sections: [{ id: 'only' }] }).sections.length, 3);
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
