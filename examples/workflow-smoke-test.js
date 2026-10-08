export const meta = {
  name: 'agenttype-smoke-test',
  description: 'Verify external-model agentType routes in an explicitly supplied workspace',
  phases: [
    { title: 'Execute', detail: 'GLM and Haiku agents complete separate small tasks' },
    { title: 'Verify', detail: 'One independent verification of all results' },
  ],
}

// Workflow supplies args, agent, and pipeline; this is a runtime script, not a Node module.
// Pass { workDir: '/absolute/authorized/workspace' }; reviewWithSol is optional and defaults to false.
if (typeof args !== 'object' || args === null || typeof args.workDir !== 'string' ||
    !/^(\/|[A-Za-z]:[\\/])/.test(args.workDir) || /[\u0000\r\n]/.test(args.workDir)) {
  throw new Error('args.workDir must be an explicit absolute, authorized working directory')
}
if (args.reviewWithSol !== undefined && typeof args.reviewWithSol !== 'boolean') {
  throw new Error('args.reviewWithSol must be a boolean when supplied')
}
const workDir = args.workDir.replace(/[\\/]+$/, '')
if (!workDir || /^[A-Za-z]:$/.test(workDir)) {
  throw new Error('args.workDir must name a workspace, not a filesystem root')
}
const baseDir = `${workDir}/workflow-agenttype-smoke`
const RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'failed'] },
    model: { type: 'string' },
    file: { type: 'string' },
    output: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['status', 'model', 'file', 'output'],
}
const TASKS = [
  {
    type: 'glm-5.3', dir: `${baseDir}/glm`, file: 'pal.py', expected: 'True',
    task: 'Write is_palindrome(s) in pal.py (ignore case and non-alphanumerics).',
    command: 'python3 -c "import pal; print(pal.is_palindrome(\'A man, a plan, a canal: Panama\'))"',
  },
  {
    type: 'glm-5.3-flash', dir: `${baseDir}/flash`, file: 'temp.py', expected: '98.6',
    task: 'Write celsius_to_f(c) in temp.py using c * 9 / 5 + 32.',
    command: 'python3 -c "import temp; print(temp.celsius_to_f(37))"',
  },
  {
    type: 'haiku-5.5', dir: `${baseDir}/haiku`, file: 'marker.txt', expected: 'HAIKU_ROUTE_OK',
    task: 'Write exactly HAIKU_ROUTE_OK followed by a newline to marker.txt.',
    command: 'python3 -c "from pathlib import Path; print(Path(\'marker.txt\').read_text().strip())"',
  },
]

function requireResult(result, task) {
  if (!result || result.status !== 'ok' || result.error ||
      typeof result.model !== 'string' || !result.model.trim() ||
      result.file !== `${task.dir}/${task.file}` ||
      typeof result.output !== 'string' || result.output.trim() !== task.expected) {
    throw new Error(`Missing, failed, or invalid execution result for ${task.type}`)
  }
  return result
}

const results = await pipeline(
  TASKS,
  task => agent(
    `Working directory: ${task.dir} (create this subdirectory only). ${task.task} ` +
    `Run this exact command in that directory: ${task.command}. Expected stdout: ${task.expected}. ` +
    'Return status ok only if the command actually succeeds and the output matches; otherwise return failed and explain error. ' +
    `Return your model name, absolute file path ${task.dir}/${task.file}, and exact observed stdout. Stay within your subdirectory.`,
    { label: `exec:${task.type}`, phase: 'Execute', agentType: task.type, schema: RESULT },
  ),
  (result, task) => requireResult(result, task),
)

if (!Array.isArray(results) || results.length !== TASKS.length) {
  throw new Error('Pipeline returned missing execution results')
}
for (const task of TASKS) {
  const matches = results.filter(result => result && result.file === `${task.dir}/${task.file}`)
  if (matches.length !== 1) throw new Error(`Missing or duplicate execution result for ${task.type}`)
  requireResult(matches[0], task)
}

const VERIFY = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'failed'] },
    observations: {
      type: 'array', items: RESULT, minItems: TASKS.length, maxItems: TASKS.length,
    },
    error: { type: 'string' },
  },
  required: ['status', 'observations'],
}
// Low-risk tasks use the controller; opt into one Sol review only when needed.
const verifyOptions = { label: 'verify:all', phase: 'Verify', schema: VERIFY }
if (args.reviewWithSol === true) verifyOptions.agentType = 'gpt-6.1-sol'
const verification = await agent(
  'Independently verify all three tasks below. Do not trust execution claims: inspect each actual file and re-run ' +
  'each listed command in its working directory. Return exact observed stdout for every task using the result schema; ' +
  'use status failed and error for any missing file, failed command, or mismatch. Do not edit files. ' +
  'Direct review only; do not invoke /code-review or other skills.\n' +
  JSON.stringify({ tasks: TASKS, claims: results }),
  verifyOptions,
)
if (!verification || verification.status !== 'ok' || verification.error ||
    !Array.isArray(verification.observations) || verification.observations.length !== TASKS.length) {
  throw new Error('Independent verification is missing or failed')
}
for (const task of TASKS) {
  const matches = verification.observations.filter(result => result && result.file === `${task.dir}/${task.file}`)
  if (matches.length !== 1) throw new Error(`Missing or duplicate verification for ${task.type}`)
  requireResult(matches[0], task)
}
return { exec: results, verification }
