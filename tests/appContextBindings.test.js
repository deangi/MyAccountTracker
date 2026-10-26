import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

test('file-opening code has no undefined names', async () => {
  const eslint = new ESLint();
  const [result] = await eslint.lintFiles(['src/store/AppContext.jsx']);
  const undefinedNames = result.messages.filter(message => message.ruleId === 'no-undef');
  assert.deepEqual(undefinedNames, []);
});
