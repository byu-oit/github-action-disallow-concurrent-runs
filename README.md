# ![BYU logo](https://www.hscripts.com/freeimages/logos/university-logos/byu/byu-logo-clipart-128.gif) disallow-concurrent-runs
A GitHub Action for disallowing concurrent workflow runs

Unfortunately, GitHub Actions does not currently have a way to queue workflows.

If you have a workflow to, say, deploy an application and it goes :boom: if multiple deployments are changing things at the same time, then this might be for you.

Simply, this fails if the given workflow is already running for a particular branch.

## Usage

```yaml
# ...
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Disallow Concurrent Runs
        uses: byu-oit/disallow-concurrent-runs@v1
        with:
          token: ${{ github.token }}
      # ... The rest of your deployment
```

## Contributing
Hopefully this is useful to others at BYU. Feel free to ask me some questions about it, but I make no promises about being able to commit time to support it.

### Modifying Source Code

Just run `npm install` locally. There aren't many files here, so hopefully it should be pretty straightforward.

### Cutting new releases

GitHub Actions will run the entry point from the `action.yml`. In our case, that happens to be `/dist/index.js`.

Actions run from GitHub repos. We don't want to check in `node_modules`. Hence, we package the app using `npm run package`.

Then, be sure to create a new GitHub release, following SemVer.
