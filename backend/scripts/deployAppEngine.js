import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendDir, '..');
const frontendDir = path.join(repoRoot, 'frontend');
const frontendDistDir = path.join(frontendDir, 'dist');
const backendPublicDir = path.join(backendDir, 'public');

const skipBuild = process.argv.includes('--skip-build');
const useShell = process.platform === 'win32';
const npmCommand = 'npm';
const gcloudCommand = 'gcloud';

function runCommand(command, args, cwd, capture = false) {
  const options = capture
    ? {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: useShell,
      }
    : { cwd, stdio: 'inherit', shell: useShell };

  const result = spawnSync(command, args, options);

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = capture ? (result.stderr || '').trim() : '';
    const stdout = capture ? (result.stdout || '').trim() : '';
    const details = [stderr, stdout].filter(Boolean).join('\n');

    throw new Error(
      `Command failed (${command} ${args.join(' ')}), exit code ${result.status}${details ? `\n${details}` : ''}`,
    );
  }

  if (capture) {
    return (result.stdout || '').trim();
  }

  return '';
}

function syncBuildToBackendPublic() {
  if (!existsSync(frontendDistDir)) {
    throw new Error(`Frontend build output not found: ${frontendDistDir}`);
  }

  rmSync(backendPublicDir, { recursive: true, force: true });
  mkdirSync(backendPublicDir, { recursive: true });

  for (const entry of readdirSync(frontendDistDir)) {
    cpSync(
      path.join(frontendDistDir, entry),
      path.join(backendPublicDir, entry),
      { recursive: true, force: true },
    );
  }
}

try {
  console.log('Starting App Engine deployment pipeline...');
  console.log(`Repository root: ${repoRoot}`);

  if (!skipBuild) {
    console.log('\n1) Building frontend...');
    runCommand(npmCommand, ['run', 'build'], frontendDir);
  } else {
    console.log('\n1) Skipping frontend build (--skip-build).');
  }

  console.log('\n2) Syncing frontend dist to backend/public...');
  syncBuildToBackendPublic();

  console.log('\n3) Deploying backend to App Engine...');
  runCommand(gcloudCommand, ['app', 'deploy', 'app.yaml', '--quiet'], backendDir);

  console.log('\n4) Verifying latest deployed version...');
  const latestVersion = runCommand(
    gcloudCommand,
    [
      'app',
      'versions',
      'list',
      '--service=default',
      '--sort-by=~version.id',
      '--limit=1',
      '--format=value(version.id)',
    ],
    backendDir,
    true,
  );

  const defaultHostname = runCommand(
    gcloudCommand,
    ['app', 'describe', '--format=value(defaultHostname)'],
    backendDir,
    true,
  );

  console.log('\nDeployment complete.');
  console.log(`Latest version: ${latestVersion}`);
  console.log(`App URL: https://${defaultHostname}`);
} catch (error) {
  console.error('\nDeployment failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
