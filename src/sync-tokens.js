// Transfers the design token commits from the gw-theme branch onto a new branch created from master.
//
// Every gw-theme commit that changed tokens/tokens.json since the last sync is applied as a separate
// commit (only its tokens.json changes, with the original author, date and message) and gets a
// "Gw-Theme-Commit: <sha>" trailer. The branch is then pushed and merged with a squash merge, which keeps
// the commit messages, so the trailers end up in master and mark which gw-theme commits are already synced.
//
// Usage:
//   npm run sync-tokens                    create the sync branch and apply the new commits
//   npm run sync-tokens -- --continue      continue on the current branch after resolving a conflict
//   npm run sync-tokens -- --from <sha>    treat <sha> as the last synced gw-theme commit
//   npm run sync-tokens -- --base <ref>    create the sync branch from <ref> instead of origin/master
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REMOTE = 'origin';
const SOURCE_BRANCH = 'gw-theme';
const TARGET_BRANCH = 'master';
const TOKENS_FILE = 'tokens/tokens.json';
const TRAILER = 'Gw-Theme-Commit';

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const isContinue = process.argv.includes('--continue');
const fromArg = getArg('from');
const source = `${REMOTE}/${SOURCE_BRANCH}`;
const base = getArg('base') || `${REMOTE}/${TARGET_BRANCH}`;

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function lines(output) {
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function shortSha(sha) {
  return sha.slice(0, 7);
}

// --- Checks -------------------------------------------------------------------
if (git(['status', '--porcelain', '--untracked-files=no'])) {
  fail('The working tree has uncommitted changes. Commit or stash them first.');
}

console.info(`📥 Fetching ${REMOTE}...`);
git(['fetch', REMOTE, SOURCE_BRANCH, TARGET_BRANCH]);

// --- Find the last synced gw-theme commit -------------------------------------
function syncedShas(ref) {
  return new Set(lines(git(['log', ref, `--format=%(trailers:key=${TRAILER},valueonly)`])));
}

function findLastSynced() {
  if (fromArg) {
    return git(['rev-parse', '--verify', `${fromArg}^{commit}`]);
  }

  const tokenCommits = lines(git(['rev-list', '--no-merges', source, '--', TOKENS_FILE]));

  // The trailers left in master (and on the current branch when continuing) by previous syncs.
  const synced = syncedShas(base);
  if (isContinue) {
    syncedShas('HEAD').forEach((sha) => synced.add(sha));
  }
  const lastByTrailer = tokenCommits.find((sha) => synced.has(sha));
  if (lastByTrailer) {
    return lastByTrailer;
  }

  // No trailers yet (syncs made before this script): use the newest gw-theme commit whose
  // tokens.json is identical to the one in master.
  const baseBlob = git(['rev-parse', `${base}:${TOKENS_FILE}`]);
  const lastByContent = tokenCommits.find((sha) => git(['rev-parse', `${sha}:${TOKENS_FILE}`]) === baseBlob);
  if (lastByContent) {
    console.info(`ℹ️  No ${TRAILER} trailer found in ${base}, using the gw-theme commit with identical ${TOKENS_FILE}.`);
    return lastByContent;
  }

  fail(`Cannot find the last synced ${SOURCE_BRANCH} commit. Pass it with --from <sha>.`);
}

const lastSynced = findLastSynced();
console.info(`🔖 Last synced ${SOURCE_BRANCH} commit: ${git(['log', '-1', '--format=%h %ad %s', '--date=short', lastSynced])}`);

const pending = lines(git(['rev-list', '--reverse', '--no-merges', `${lastSynced}..${source}`, '--', TOKENS_FILE]));
if (!pending.length) {
  console.info(`✅ ${TARGET_BRANCH} is up to date with ${source}, nothing to sync.`);
  process.exit(0);
}

// --- Create the sync branch -----------------------------------------------------
if (!isContinue) {
  const branch = `sync-tokens-${new Date().toISOString().slice(0, 10)}`;
  if (git(['branch', '--list', branch])) {
    fail(`Branch ${branch} already exists. Delete it, or switch to it and run with --continue.`);
  }
  git(['switch', '-c', branch, base]);
  console.info(`🌿 Created branch ${branch} from ${base}`);
}

// --- Apply the commits ----------------------------------------------------------
const gitDir = git(['rev-parse', '--git-dir']);
const messageFile = path.join(gitDir, 'SYNC_TOKENS_MSG');

for (const sha of pending) {
  const subject = git(['log', '-1', '--format=%s', sha]);
  const author = git(['log', '-1', '--format=%an <%ae>', sha]);
  const date = git(['log', '-1', '--format=%aI', sha]);
  const message = git(['interpret-trailers', '--trailer', `${TRAILER}: ${sha}`], {
    input: git(['log', '-1', '--format=%B', sha]),
  });

  const otherFiles = lines(git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha])).filter((f) => f !== TOKENS_FILE);
  if (otherFiles.length) {
    console.warn(`⚠️  ${shortSha(sha)} also changes ${otherFiles.join(', ')} — only ${TOKENS_FILE} is taken.`);
  }

  // A real three-way merge (unlike applying a patch) recognises changes that are already present.
  try {
    git(['cherry-pick', '--no-commit', sha]);
  } catch {
    // Conflicts are checked below, after the files other than tokens.json are reverted.
  }
  if (otherFiles.length) {
    git(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...otherFiles]);
  }

  if (git(['diff', '--name-only', '--diff-filter=U'])) {
    fs.writeFileSync(messageFile, `${message}\n`);
    console.error(`
❌ Conflict while applying ${shortSha(sha)} "${subject}".
   Resolve the conflict in ${TOKENS_FILE}, then run:

     git add ${TOKENS_FILE}
     git commit -F ${messageFile} --author="${author}" --date="${date}"
     npm run sync-tokens -- --continue
`);
    process.exit(1);
  }

  try {
    git(['diff', '--cached', '--quiet']);
    console.warn(`⚠️  ${shortSha(sha)} "${subject}" results in no changes, skipped.`);
    try {
      git(['cherry-pick', '--quit']);
    } catch {
      // No cherry-pick state left behind.
    }
    continue;
  } catch {
    // There are staged changes to commit.
  }

  git(['commit', '--quiet', '-F', '-', `--author=${author}`, `--date=${date}`], { input: message });
  console.info(`✔️  ${shortSha(sha)} ${date.slice(0, 10)} ${subject}`);
}

// --- Summary ----------------------------------------------------------------------
// The branch should end up with exactly the tokens of the last applied gw-theme commit. A difference
// means master had its own token changes, or a change was merged into the wrong place of the file.
const lastPending = pending[pending.length - 1];
if (git(['rev-parse', `HEAD:${TOKENS_FILE}`]) !== git(['rev-parse', `${lastPending}:${TOKENS_FILE}`])) {
  console.warn(`
⚠️  ${TOKENS_FILE} differs from the one in ${SOURCE_BRANCH} at ${shortSha(lastPending)}. Review the difference before pushing:

     git diff ${shortSha(lastPending)} HEAD -- ${TOKENS_FILE}`);
}

const branch = git(['branch', '--show-current']);
const synced = lines(git(['log', '--reverse', `${base}..HEAD`, `--format=%(trailers:key=${TRAILER},valueonly)`]));
const today = new Date();
const title = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()} Update tokens`;

console.info(`
✅ Branch ${branch} contains ${synced.length} synced commit(s).

Next steps:
  1. npm run build — and check the result (e.g. npm run compare-css-variables, npm link in the application)
  2. git push -u ${REMOTE} ${branch}
  3. Open a pull request against ${TARGET_BRANCH}, e.g. "${title}"
  4. Merge it with "Squash and merge" and keep the commit messages in the squash commit:
     the ${TRAILER} trailers mark the synced commits for the next run.

Synced ${SOURCE_BRANCH} commits:
${synced.map((sha) => `  - ${git(['log', '-1', '--format=%h %ad %s', '--date=short', sha])}`).join('\n')}
`);
