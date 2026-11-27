/**
 * The steps of JenkinsfileRelease, loaded with `load`. Kept close to .jenkins/release-steps.groovy in graphdb-workbench,
 * so that a fix in one can be ported to the other.
 *
 * Every step records itself in `progress`, so that a failure or an abort can say where the release
 * stopped, what was already published and what to do next.
 */

import groovy.transform.Field
import org.jenkinsci.plugins.workflow.steps.FlowInterruptedException

@Field
String NODE_IMAGE = 'node:22.17.0-alpine3.22'

@Field
String PACKAGE = 'graphwise-styleguide'

@Field
String MANUAL_RELEASE = 'README.md → Publish New Package Version'

@Field
Map progress = [
    step       : 'Start',
    detail     : '',
    hint       : 'Rerun the release.',
    published  : [],
    abortReason: '',
    releaseUrl : ''
]

Map progress() {
    return progress
}

void checkout(String branch) {
    track('Checkout', 'Rerun the release.') {
        git_cmd.checkout(branch: branch)
    }
}

/**
 * Fails before anything is built when the version is malformed or already released, or the npm token is invalid.
 */
void validate(String version) {
    track('Validate', 'Fix the problem above, then rerun the release.') {
        // Only stable versions: src/create-github-release.js and the previous-release lookup expect X.Y.Z.
        if (!(version ==~ /\d+\.\d+\.\d+/)) {
            fail("RELEASE_VERSION '${version}' is not X.Y.Z", 'Rerun the release with a valid RELEASE_VERSION.')
        }

        int tagStatus = sh(returnStatus: true,
            script: "git ls-remote --exit-code --tags https://github.com/Ontotext-AD/graphwise-styleguide.git refs/tags/v${version} > /dev/null")
        if (tagStatus == 0) {
            fail("tag v${version} already exists on GitHub", 'Rerun the release with an unused RELEASE_VERSION.')
        }
        if (tagStatus != 2) {
            fail('could not read the tags from GitHub', 'Rerun the release.')
        }

        withNode(image: NODE_IMAGE) {
            // 0: not in npm, 1: already in npm, 2: npm could not be read
            int npmStatus = sh(returnStatus: true, script: """
                out=\$(npm view ${PACKAGE}@${version} version 2>&1) && { [ -z "\$out" ] && exit 0 || exit 1; }
                echo "\$out" | grep -q E404 && exit 0
                echo "\$out"
                exit 2
            """)
            if (npmStatus == 1) {
                fail("${PACKAGE}@${version} is already in npm", 'Rerun the release with an unused RELEASE_VERSION.')
            }
            if (npmStatus != 0) {
                fail("could not read ${PACKAGE} from npm", 'Rerun the release.')
            }

            withNpmToken {
                // A temporary user config: the .npmrc in the workspace is written only for the publish.
                int whoamiStatus = sh(returnStatus: true, script: '''
                    npmrc=$(mktemp)
                    trap 'rm -f "$npmrc"' EXIT
                    echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > "$npmrc"
                    npm whoami --userconfig "$npmrc"
                ''')
                if (whoamiStatus != 0) {
                    fail('npm authentication failed: invalid or expired NPM_TOKEN', 'Renew the NPM_TOKEN in Keeper, then rerun the release.')
                }
            }
        }
    }
}

/**
 * Builds the package with the release version and generates the CSS variables summary for the GitHub release notes,
 * before anything is pushed, so that a failure here stops the release while it can still be repeated.
 */
void build(String version, String branch) {
    track('Build', "Fix the build on ${branch}, then rerun the release.") {
        withNode(image: NODE_IMAGE) {
            npm.prepareRelease(version: version, scripts: ['build'])
            sh "npm run compare-css-variables -- --before ${version}"
        }
    }
}

/**
 * Commits and tags the release, then pushes the branch and the tag in one atomic push.
 * The push is rejected, and nothing is published, when the branch moved during the build.
 */
void push(String version, String branch, boolean dryRun) {
    track('Git push', 'Check the GitHub access, then rerun the release with the same version.') {
        withKsm(application: [
            [
                credentialsId: 'ksm-jenkins',
                secrets: [
                    [destination: 'env', envVar: 'GIT_USER', filePath: '', notation: 'keeper://8hm1g9HCfBPgoWAmpiHn6w/field/login']
                ]
            ]
        ]) {
            sh 'mkdir -p ~/.ssh'
            sh 'ssh-keyscan github.com >> ~/.ssh/known_hosts'

            sh 'git config --global user.name "$GIT_USER"'
            sh 'git config --global user.email "$GIT_USER@users.noreply.github.com"'

            sh "git commit --no-verify -a -m 'Release ${version}'"
            sh "git tag -a v${version} -m 'Release v${version}'"

            sh 'git remote set-url origin git@github.com:Ontotext-AD/graphwise-styleguide.git'
            int status = sh(returnStatus: true,
                script: "git push --atomic${dryRunFlag(dryRun)} origin HEAD:refs/heads/${branch} refs/tags/v${version} > .git/release-push.log 2>&1")
            String output = readFile('.git/release-push.log')
            echo output
            if (status != 0) {
                if (output.contains('[rejected]')) {
                    fail("${branch} moved during the build", 'Rerun the release with the same version.')
                }
                fail('git push failed', 'Check the GitHub access, then rerun the release with the same version.')
            }
            if (!dryRun) {
                progress.published << "git tag v${version}"
            }
        }
    }
    // From here on the tag is on GitHub: a failure before the publish must not advise a rerun.
    progress.step = 'npm publish'
    progress.hint = afterPushHint(publishHint(version), dryRun)
}

void publish(String version, boolean dryRun) {
    track('npm publish', afterPushHint(publishHint(version), dryRun)) {
        withNode(image: NODE_IMAGE) {
            withNpmToken {
                sh 'echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > .npmrc'
                sh "npm publish${dryRunFlag(dryRun)}"
            }
        }
        if (!dryRun) {
            progress.published << "npm ${PACKAGE}@${version}"
        }
    }
}

/**
 * Creates the GitHub release. The package is already published, so the JenkinsfileRelease marks a failure here
 * only as unstable. A dry run writes the notes to generated/release-notes.md and archives them: the tag is not on
 * GitHub then, so the notes end at the branch.
 */
void githubRelease(String version, String branch, boolean dryRun) {
    track('GitHub release', afterPushHint("Create the GitHub release v${version} manually: ${MANUAL_RELEASE}.", dryRun)) {
        withNode(image: NODE_IMAGE) {
            withKsm(application: [
                [
                    credentialsId: 'ksm-jenkins',
                    secrets: [
                        [destination: 'env', envVar: 'GITHUB_TOKEN', filePath: '', notation: 'keeper://8hm1g9HCfBPgoWAmpiHn6w/field/password']
                    ]
                ]
            ]) {
                String options = dryRun ? " --dry-run --target ${branch}" : ''
                sh "node src/create-github-release.js --version ${version}${options}"
            }
        }
        if (dryRun) {
            archiveArtifacts artifacts: 'generated/release-notes.md'
        } else {
            progress.releaseUrl = readFile('generated/release-url.txt').trim()
            progress.published << 'GitHub release'
        }
    }
}

/**
 * Removes the npm token, and the local release commit and tag that were not pushed,
 * so that a rerun of the same version starts from the branch.
 */
void cleanup(String version) {
    dir("${env.WORKSPACE}") {
        sh 'rm -f .npmrc'
        withEnv(["RELEASE_VERSION=${version}", "RELEASE_PUSHED=${progress.published ? 'true' : 'false'}"]) {
            sh '''
                git tag -d "v$RELEASE_VERSION" 2>/dev/null || true
                if [ "$RELEASE_PUSHED" = false ] && [ "$(git log -1 --format=%s)" = "Release $RELEASE_VERSION" ]; then
                    git reset --hard HEAD~1
                fi
            '''
        }
    }
}

// A dry run pushes no tag, so the manual steps from the tag do not apply.
String afterPushHint(String hint, boolean dryRun) {
    return dryRun ? 'Fix the problem above, then rerun the dry run.' : hint
}

String publishHint(String version) {
    return "Publish ${PACKAGE} ${version} manually from tag v${version}, then create the GitHub release: ${MANUAL_RELEASE}."
}

void track(String name, String hint, Closure body) {
    progress.step = name
    progress.detail = ''
    progress.hint = hint
    try {
        body()
    } catch (FlowInterruptedException e) {
        progress.abortReason = interruptionReason(e)
        throw e
    }
}

void fail(String detail, String hint) {
    progress.detail = detail
    progress.hint = hint
    error(detail)
}

String interruptionReason(FlowInterruptedException e) {
    try {
        String cause = e.causes ? e.causes[0].shortDescription : ''
        if (cause.toLowerCase().contains('timeout')) {
            return 'timeout'
        }
        return cause.replaceFirst(/^Aborted /, '')
    } catch (readError) {
        echo "Could not read the abort reason: ${readError.getMessage()}"
        return ''
    }
}

void withNpmToken(Closure body) {
    withKsm(application: [
        [
            credentialsId: 'ksm-jenkins',
            secrets: [
                [destination: 'env', envVar: 'NPM_TOKEN', filePath: '', notation: 'keeper://FcbEgbi287PN2yx_3uCz4Q/field/note'],
            ]
        ]
    ]) {
        body()
    }
}

String dryRunFlag(boolean dryRun) {
    return dryRun ? ' --dry-run' : ''
}

return this
