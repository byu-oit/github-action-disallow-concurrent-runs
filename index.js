const { getInput, startGroup, endGroup, setFailed } = require('@actions/core')
const github = require('@actions/github')

async function run () {
  try {
    const token = getInput('token', { required: true })
    const pollSeconds = getInput('poll_seconds')
    const octokit = github.getOctokit(token)
    const sleeper = () => new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000))
    const { eventName, repo: { owner, repo }, workflow: workflowName, ref, sha } = github.context

    if (eventName !== 'push' && eventName !== 'pull_request') {
      setFailed('Events other than `push` and `pull_request` are not supported.')
      return
    }
    const thisRunNumber = github.context.runNumber

    const branch = (eventName === 'push')
      ? ref.slice('refs/heads/'.length) // ref = 'refs/heads/master'
      : github.context.payload.pull_request.head.ref // 'master'

    const { data: { workflows } } = await octokit.actions.listRepoWorkflows({
      owner,
      repo
    })
    const { id: workflowId, path: pathToWorkflow } = workflows.find(workflow => (
      workflow.name === workflowName &&
      workflow.state === 'active'
    ))

    startGroup('Workflow Info')
    console.log({ owner, repo, branch, workflowName, workflowId, pathToWorkflow })
    endGroup()
    var incompleteRuns;

    while (true) {
      const { data: { workflow_runs: workflowRuns } } = await octokit.actions.listWorkflowRuns({
        owner,
        repo,
        workflow_id: workflowId,
        branch
      })
      const runs = workflowRuns.map(run => ({
        runNumber: run.run_number,
        commit: {
          message: run.head_commit.message,
          author: run.head_commit.author.name,
          timestamp: run.head_commit.timestamp,
          sha: run.head_sha
        },
        status: run.status,
        conclusion: run.conclusion,
        created: run.created_at,
        updated: run.updated_at,
        id: run.id
      }))

      startGroup(`All Runs (${runs.length})`)
      console.log(runs)
      endGroup()

      incompleteRuns = runs.filter(run => run.status !== 'completed' && run.runNumber < thisRunNumber)

      startGroup(`Incomplete and older runs (${incompleteRuns.length})`)
      console.log(incompleteRuns)
      endGroup()

      if (incompleteRuns.length === 0) {
        console.log('✔ This was the only or oldest run for this workflow on this branch 🎉')
        return
      }
      if (pollSeconds) {
          await sleeper()
      }
    } while (pollSeconds > 0)
    console.log('Adding an annotation to explain why this action is about to cancel this workflow run')
    const checkRunId = await getCheckRunId(octokit, owner, repo, branch, workflowName)
    await octokit.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      output: {
        title: 'Disallow Concurrent Runs',
        summary: 'A GitHub Action for disallowing concurrent workflow runs',
        annotations: [
          {
            path: 'this repository',
            start_line: 0,
            end_line: 0,
            annotation_level: 'failure',
            title: 'Disallow Concurrent Runs',
            message: '❌ Another run was already in process for this workflow and branch 💥'
          }
        ]
      }
    })

    const shaToCancel = (eventName === 'push') ? sha : github.context.payload.pull_request.head.sha
    const { id: runId } = incompleteRuns.find(run => run.commit.sha === shaToCancel)
    console.log(`Cancelling workflow run with ID ${runId}`)
    await octokit.actions.cancelWorkflowRun({
      owner,
      repo,
      run_id: runId
    })
    console.log('Successfully cancelled!')

    // Even though GitHub immediately responds that the workflow was cancelled, I've seen it take ~15s before
    // it actually gets cancelled. This should help us not move on to the next steps in the job.
    await sleep(20000)
  } catch (e) {
    setFailed(`An error occurred: ${e.message || e}`)
  }
}

run()

async function getCheckRunId (octokit, owner, repo, branch, name) {
  const parameters = {
    owner,
    repo,
    ref: branch,
    status: 'in_progress',
    name
  }
  let checkRuns
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (attempt > 1) await sleep(1000)
    checkRuns = await getCheckRuns(octokit, parameters)
    if (checkRuns.length > 0) break
  }
  if (checkRuns.length === 0) {
    throw Error('Error while getting the GitHub check run ID, which is needed to give a helpful message explaining why this action was about to cancel your workflow.')
  }

  // There's probably only one check run that matches those filters, but we can also inspect the response
  const { id: checkRunId } = checkRuns.find(run => run.app.name === 'GitHub Actions')
  return checkRunId
}

async function getCheckRuns (octokit, parameters) {
  const { data: { check_runs: checkRuns } } = await octokit.checks.listForRef(parameters)
  return checkRuns
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
