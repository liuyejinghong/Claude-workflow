export const meta = {
  name: 'agenttype-smoke-test',
  description: 'Verify workflow agent() can route to external-model subagents via agentType',
  phases: [{ title: 'Execute', detail: 'GLM agents write small files' }, { title: 'Verify', detail: 'GPT-6 Sol cross-checks' }],
}
const SCHEMA = { type: 'object', properties: { model: { type: 'string' }, file: { type: 'string' }, output: { type: 'string' } }, required: ['model', 'file', 'output'] }
const TASKS = [
  { type: 'glm-5.3', dir: '/tmp/wftest/glm', task: 'Write is_palindrome(s) in pal.py (ignore case and non-alphanumerics) and run python3 -c "import pal;print(pal.is_palindrome(\'A man, a plan, a canal: Panama\'))".' },
  { type: 'glm-5.3-flash', dir: '/tmp/wftest/flash', task: 'Write celsius_to_f(c) in temp.py and run python3 -c "import temp;print(temp.celsius_to_f(37))".' },
]
const results = await pipeline(
  TASKS,
  t => agent(`Working directory: ${t.dir} (create it). ${t.task} Return your model name, the file path, and the exact command output.`,
    { label: `exec:${t.type}`, phase: 'Execute', agentType: t.type, schema: SCHEMA }),
  (r, t) => r && agent(`Independently verify this claim without trusting it: in ${t.dir}, file ${r.file} exists and the task "${t.task}" produces output "${r.output}". Re-run the command yourself. Return your model name, the file path, and the output you observed.`,
    { label: `verify:${t.type}`, phase: 'Verify', agentType: 'gpt-6-sol', schema: SCHEMA }).then(v => ({ exec: r, verify: v }))
)
return results
