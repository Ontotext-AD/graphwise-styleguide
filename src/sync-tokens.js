// Transfers the design token commits from the gw-theme branch onto a new branch created from master and opens
// a pull request with them.
//
// Every gw-theme commit that changed tokens/tokens.json since the last sync is applied as a separate
// commit (only its tokens.json changes, with the original author, date and message) and gets a
// "Gw-Theme-Commit: <sha>" trailer, so a conflict can be resolved one commit at a time.
//
// The applied commits are then squashed into one "DD.MM.YYYY Update tokens" commit, which lists the gw-theme
// commit messages and keeps all trailers, with the gw-theme authors as co-authors. The script builds the
// stylesheets and, after a confirmation, pushes the branch and opens the pull request (with the GitHub CLI, if
// installed). Any merge method keeps that commit message in master, where the trailers mark which gw-theme
// commits are already synced. They are searched for in the whole commit message, not parsed as git trailers,
// because GitHub may add a "---------" separator and Co-authored-by lines after them in a squash merge.
//
// Usage:
//   npm run sync-tokens                    create the sync branch, apply the new commits and open a pull request
//   npm run sync-tokens -- --continue      continue on the current branch after resolving a conflict
//   npm run sync-tokens -- --from <sha>    treat <sha> as the last synced gw-theme commit
//   npm run sync-tokens -- --base <ref>    create the sync branch from <ref> instead of origin/master
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';

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
const baseCommit = git(['rev-parse', '--verify', `${base}^{commit}`]);

// --- Find the last synced gw-theme commit -------------------------------------
const TRAILER_PATTERN = new RegExp(`^${TRAILER}: ([0-9a-f]{40})$`, 'gm');

function syncedShasIn(messages) {
  return [...messages.matchAll(TRAILER_PATTERN)].map((match) => match[1]);
}

function syncedShas(ref) {
  return new Set(syncedShasIn(git(['log', ref, '--format=%B'])));
}

function findLastSynced() {
  if (fromArg) {
    return git(['rev-parse', '--verify', `${fromArg}^{commit}`]);
  }

  const tokenCommits = lines(git(['rev-list', '--no-merges', source, '--', TOKENS_FILE]));

  // The trailers left in master (and on the current branch when continuing) by previous syncs.
  const synced = syncedShas(baseCommit);
  if (isContinue) {
    syncedShas('HEAD').forEach((sha) => synced.add(sha));
  }
  const lastByTrailer = tokenCommits.find((sha) => synced.has(sha));
  if (lastByTrailer) {
    return lastByTrailer;
  }

  // No trailers yet (syncs made before this script): use the newest gw-theme commit whose
  // tokens.json is identical to the one in master.
  const baseBlob = git(['rev-parse', `${baseCommit}:${TOKENS_FILE}`]);
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
// When continuing, the commits applied before the conflict are already on the branch, so it is finished
// (squashed, built and pushed) even if nothing is left to apply.
if (!pending.length && !isContinue) {
  console.info(`✅ ${TARGET_BRANCH} is up to date with ${source}, nothing to sync.`);
  process.exit(0);
}

// --- Create the sync branch -----------------------------------------------------
if (!isContinue) {
  const branch = `sync-tokens-${new Date().toISOString().slice(0, 10)}`;
  if (git(['branch', '--list', branch])) {
    fail(`Branch ${branch} already exists. Delete it, or switch to it and run with --continue.`);
  }
  git(['switch', '-c', branch, baseCommit]);
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

// --- Squash ----------------------------------------------------------------------
// Onto the commit the branch was created from: when continuing, the base may have moved since.
const forkPoint = git(['merge-base', baseCommit, 'HEAD']);
const synced = syncedShasIn(git(['log', '--reverse', `${forkPoint}..HEAD`, '--format=%B']));
if (!synced.length) {
  fail(`The branch has no synced ${SOURCE_BRANCH} commits.`);
}

const today = new Date();
const title = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()} Update tokens`;

// Each gw-theme commit message becomes a list item: its first line, followed by the rest indented.
function listItem(sha) {
  const [subject, ...body] = git(['log', '-1', '--format=%B', sha]).split('\n');
  return [`* ${subject}`, ...body.map((line) => (line.trim() ? `  ${line}` : ''))].join('\n').replace(/\n{3,}/g, '\n\n');
}

const me = git(['config', 'user.email']);
const coAuthors = [...new Set(synced.map((sha) => git(['log', '-1', '--format=%an <%ae>', sha])))].filter(
  (author) => !author.endsWith(`<${me}>`)
);
const squashMessage = [
  title,
  synced.map(listItem).join('\n'),
  [...synced.map((sha) => `${TRAILER}: ${sha}`), ...coAuthors.map((author) => `Co-authored-by: ${author}`)].join('\n'),
].join('\n\n');

git(['reset', '--soft', forkPoint]);
git(['commit', '--quiet', '-F', '-'], { input: `${squashMessage}\n` });
console.info(`🧩 Squashed ${synced.length} commit(s) into "${title}"`);

// --- Build and review -------------------------------------------------------------
function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
}

console.info('🔨 Building the stylesheets...');
run('npm', ['run', 'build']);

let cssVariables;
try {
  run('npm', ['run', 'compare-css-variables']);
  cssVariables = fs.readFileSync(path.join('generated', 'css-variables-diff.md'), 'utf8').replace('<!-- details -->', '').trim();
} catch {
  console.warn('⚠️  The CSS variables comparison failed, the pull request will not include it.');
}

// The branch should end up with exactly the tokens of the last applied gw-theme commit. A difference
// means master had its own token changes, or a change was merged into the wrong place of the file.
const lastApplied = synced[synced.length - 1];
const tokensDiffer = git(['rev-parse', `HEAD:${TOKENS_FILE}`]) !== git(['rev-parse', `${lastApplied}:${TOKENS_FILE}`]);
const branch = git(['branch', '--show-current']);
const commitInfo = (sha) => lines(git(['log', '-1', '--format=%h%n%ad%n%an%n%s', '--date=short', sha]));

console.info(`
✅ Branch ${branch} is ready: "${title}"

Synced ${SOURCE_BRANCH} commits:
${synced.map((sha) => `  - ${commitInfo(sha).join(' ')}`).join('\n')}
${tokensDiffer ? `
⚠️  ${TOKENS_FILE} differs from the one in ${SOURCE_BRANCH} at ${shortSha(lastApplied)}. Review the difference:

     git diff ${shortSha(lastApplied)} HEAD -- ${TOKENS_FILE}
` : ''}
Check the result before pushing: generated/css-variables-diff.html, npm link in the application.`);

// --- Push and open the pull request ----------------------------------------------
async function confirm(question) {
  if (!process.stdin.isTTY) {
    return false;
  }
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(question);
  prompt.close();
  return /^y(es)?$/i.test(answer.trim());
}

const prBody = [
  `Syncs the token changes from \`${SOURCE_BRANCH}\` with \`npm run sync-tokens\`.`,
  [
    `| ${SOURCE_BRANCH} | Date | Author | Commit |`,
    '|---|---|---|---|',
    ...synced.map((sha) => {
      const [short, date, author, subject] = commitInfo(sha);
      return `| \`${short}\` | ${date} | ${author} | ${subject} |`;
    }),
  ].join('\n'),
  cssVariables && `## CSS variables\n\n${cssVariables}`,
  `Merge with any method, keeping the commit message: its \`${TRAILER}\` lines mark the synced commits for the next \`npm run sync-tokens\`.`,
]
  .filter(Boolean)
  .join('\n\n');
const prBodyFile = path.join(gitDir, 'SYNC_TOKENS_PR.md');
fs.writeFileSync(prBodyFile, `${prBody}\n`);

if (!(await confirm(`\nPush ${branch} and open a pull request against ${TARGET_BRANCH}? [y/N] `))) {
  console.info(`
Not pushed. When ready:
  git push -u ${REMOTE} ${branch}
  gh pr create --base ${TARGET_BRANCH} --title "${title}" --body-file ${prBodyFile}`);
  process.exit(0);
}

run('git', ['push', '-u', REMOTE, branch]);
try {
  run('gh', ['pr', 'create', '--base', TARGET_BRANCH, '--head', branch, '--title', title, '--body-file', prBodyFile]);
} catch {
  console.warn(`
⚠️  Could not open the pull request with the GitHub CLI (gh). Open it on GitHub with the title
   "${title}" and the description from ${prBodyFile}.`);
}
