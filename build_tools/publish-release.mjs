#!/usr/bin/env node
// Publishes a built release to GitHub Releases on this repo's `origin`.
//
// A separate command from release.mjs, run after it and after the git flow:
//
//   npm run release -- 0.2.5            build, sign and zip the installer
//   (commit, tag v0.2.5, push the tag)
//   npm run release:publish -- 0.2.5    upload it
//
// Separate because a GitHub release hangs off a tag, and the tag is part of
// the git flow release.mjs deliberately leaves to a person. Folding the
// upload into the build would either create the tag behind their back or
// fail every time for want of one.
//
// The upload goes to jmmadisonav/omni_keypad_designer, which is public, so
// anyone can download the release. The madisontech copy gets no releases.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, releaseZipName } from './project-config.mjs';
import {
  formatCommand, ghReleaseArgs, normalizeVersion, notesAreEmpty, notesAreStale, releaseNotesBody,
} from './release-steps.mjs';

const OUTPUT_DIR = path.join(ROOT, 'output');

function main(argv) {
  const args = argv.filter(a => a !== '--dry-run');
  const dryRun = argv.includes('--dry-run');
  if (args.length !== 1) {
    console.error('Usage: npm run release:publish -- <version> [--dry-run]');
    process.exit(2);
  }
  const version = normalizeVersion(args[0]);

  // Checked before anything is sent: an upload of the wrong file, or of a
  // release with last version's notes, is visible to everyone with access
  // the moment it lands.
  // The zip, not the bare installer: it carries release_notes.txt too.
  const zip = path.join(OUTPUT_DIR, releaseZipName(version));
  if (!existsSync(zip)) {
    throw new Error(`Release zip not found: ${zip}. Run \`npm run release -- ${version}\` first.`);
  }
  const notesPath = path.join(OUTPUT_DIR, 'release_notes.txt');
  const notes = existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : '';
  if (notesAreStale(notes, version)) {
    throw new Error(`${notesPath} is not for ${version}. Run \`npm run release -- ${version}\` first.`);
  }
  if (notesAreEmpty(notes)) {
    throw new Error(`${notesPath} has nothing under Features:.`);
  }

  const ghArgs = ghReleaseArgs(version, zip, releaseNotesBody(notes));
  console.log(`Publishing omni_keypad_designer ${version} to GitHub Releases${dryRun ? ' [DRY RUN]' : ''}`);
  console.log(`  RUN: ${formatCommand('gh', ghArgs)}`);
  if (dryRun) { return; }

  const result = spawnSync('gh', ghArgs, { cwd: ROOT, stdio: 'inherit', shell: false });
  if (result.error) {
    throw new Error(
      `Could not run gh: ${result.error.message}. Install the GitHub CLI (winget install GitHub.cli) `
      + 'and sign in with `gh auth login`.',
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `gh exited with ${result.status ?? result.signal}. If it says the tag doesn't exist, `
      + `push it first: git tag ${version} && git push origin ${version}.`,
    );
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
