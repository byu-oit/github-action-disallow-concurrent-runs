const { getInput, startGroup, endGroup, setFailed } = require('@actions/core')
const github = require('@actions/github')

async function run () {
  try {
    const token = getInput('token', { required: true })
    const octokit = new github.GitHub(token)

    const { repo: { owner, repo }, workflow: workflowName, payload: { ref } } = github.context
    const branch = ref.slice('refs/heads/'.length) // ref = 'refs/heads/master'

    const { data: { workflows } } = await octokit.actions.listRepoWorkflows({
      owner,
      repo
    })
    const { id: workflowId, path: pathToWorkflow } = workflows.find(workflow => workflow.name === workflowName && workflow.state === 'active')

    startGroup('Workflow Info')
    console.log({ owner, repo, branch, workflowName, workflowId, pathToWorkflow })
    endGroup()

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

    const incompleteRuns = runs.filter(run => run.status !== 'completed')

    startGroup(`Incomplete Runs (${incompleteRuns.length})`)
    console.log(incompleteRuns)
    endGroup()

    if (incompleteRuns.length > 1) {
      // const thisRun = incompleteRuns.find(run => run.commit.sha === sha)
      // console.log(thisRun)
      // await octokit.actions.cancelWorkflowRun({
      //   owner,
      //   repo,
      //   run_id: thisRun.id
      // })
      setFailed('❌ Another run was already in process for this workflow and branch 💥')
      process.exit(1)
    }

    console.log('✔ This was the only run for this workflow on this branch 🎉')
  } catch (e) {
    setFailed(`An error occurred: ${e.message || e}`)
  }
}

run()
