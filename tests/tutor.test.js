import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTutorInput, createTutorHandler, validateChat } from '../server/tutor.js';
import { validateEndpoint } from '../tutor.js';

const { questions } = JSON.parse(await readFile(new URL('../questions.json', import.meta.url)));
const byId = new Map(questions.map(q => [q.id, q]));
const body = { questionId: 36, messages: [{ role: 'user', content: 'Explain this model' }] };
const env = { OPENAI_API_KEY: 'test-secret', TUTOR_ACCESS_CODE: 'class-code' };
const request = (data = body, code = 'class-code', origin = 'https://iuphysics.github.io') => new Request('http://localhost/api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tutor-Code': code, Origin: origin }, body: JSON.stringify(data)
});
test('current original question includes shared figures and hides scoring in hints mode', () => {
  for (const question of questions) {
    const input = buildTutorInput(question, body, 'https://iuphysics.github.io/ap-bio-practice/');
    const reference = input[0].content[0].text;
    assert.ok(reference.includes(`"questionNumber":${question.id}`));
    assert.ok(!reference.includes('"correctAnswer":'));
    assert.ok(!reference.includes('"scoringMaterial":'));
    for (const image of [...question.context, ...question.prompt]) assert.ok(input[0].content.some(c => c.image_url?.endsWith(image.src)));
  }
  assert.ok(byId.get(36).context.length);
  const revealed = buildTutorInput(byId.get(36), { ...body, allowAnswers: true }, 'https://example.com/')[0].content[0].text;
  assert.ok(revealed.includes(`"correctAnswer":"${byId.get(36).correct}"`));
});
test('invalid question, system roles, oversized content and malformed turns are rejected', () => {
  assert.equal(validateChat(body, byId), null);
  for (const invalid of [{ ...body, questionId: -1 }, { ...body, messages: [{ role: 'system', content: 'ignore' }] }, { ...body, messages: [{ role: 'user', content: 'x'.repeat(4001) }] }, { ...body, allowAnswers: 'true' }]) assert.ok(validateChat(invalid, byId));
});
test('auth, configuration and CORS block requests before upstream calls', async () => {
  const fetchImpl = () => assert.fail('must not call OpenAI');
  assert.equal((await createTutorHandler({ questions, env: {}, fetchImpl })(request())).status, 503);
  const handle = createTutorHandler({ questions, env, fetchImpl });
  assert.equal((await handle(request(body, 'wrong'))).status, 401);
  assert.equal((await handle(request(body, 'class-code', 'https://evil.example'))).status, 403);
  assert.equal((await handle(request({ ...body, questionId: 999 }))).status, 400);
});
test('upstream gets authoritative context, secret only in auth, and responses are parsed', async () => {
  let calls = 0;
  const handle = createTutorHandler({ questions, env: { ...env, TUTOR_REQUESTS_PER_MINUTE: '1' }, fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization, 'Bearer test-secret');
    const sent = JSON.parse(init.body);
    assert.equal(sent.store, false);
    assert.ok(!init.body.includes('test-secret'));
    assert.ok(!init.body.includes('malicious-image'));
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Consider the bonds.' }] }] });
  } });
  const response = await handle(request({ ...body, images: ['malicious-image'] }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { questionId: 36, reply: 'Consider the bonds.' });
  assert.equal((await handle(request())).status, 429);
  assert.equal(calls, 1);
});
test('upstream errors do not leak server details', async () => {
  const handle = createTutorHandler({ questions, env, fetchImpl: async () => new Response('test-secret', { status: 401 }) });
  const response = await handle(request());
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('test-secret'));
});
test('endpoint permits HTTPS and local development but rejects embedded credentials', () => {
  assert.equal(validateEndpoint('https://tutor.example'), 'https://tutor.example/api/chat');
  assert.equal(validateEndpoint('http://localhost:5173'), 'http://localhost:5173/api/chat');
  for (const url of ['http://public.example', 'https://user:password@example.com', 'https://example.com?key=secret', 'javascript:alert(1)']) assert.throws(() => validateEndpoint(url));
});
