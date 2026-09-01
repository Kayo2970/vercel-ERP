@AGENTS.md

# Deployment workflow — standing instruction from the project owner

The VPS deploys straight off `main` (`git pull` → `npm install` → `npm run build` →
`pm2 restart`), so `main` is the live deploy branch. Follow this workflow for
every task on this project unless told otherwise for that specific request:

- **Single, discrete request** ("fix X", "add Y", one bug/feature at a time):
  once the change is made and verified (`npx tsc --noEmit` and `npm run build`
  both clean), commit and push straight to `main` immediately — no feature
  branch or PR needed. The owner deploys by pulling `main`, so it should be
  ready to go the moment the fix is done.
- **Batch / multi-item request** (a list of several distinct fixes or features
  given together, e.g. a long QA pass with many numbered items): do all the
  work on a single feature branch, committing as each item is finished. Only
  after every item in that batch is complete and verified, merge the branch
  into `main` and push — don't merge a partial batch partway through.
- Before any push to `main`, always run `npx tsc --noEmit` and `npm run build`
  and confirm both are clean. Treat every push to `main` as something that
  could go live on the next `git pull`.
- If `main` has moved (other work landed there since this session started —
  this has happened before), reconcile by merging `main` in and re-applying
  this session's still-relevant changes on top rather than force-pushing over
  it; see the reconciliation approach used for the dark-mode/tablet QA pass
  (2026-08-31) as a reference for how to do this carefully.
