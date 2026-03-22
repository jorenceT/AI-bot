const fs = require('fs/promises');
const path = require('path');

const targets = [
  path.join('android', 'app', 'src', 'main', 'assets', 'public'),
  path.join('android', 'capacitor-cordova-android-plugins')
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function cleanupStaleSiblings(targetPath) {
  const parentDir = path.dirname(targetPath);
  const baseName = path.basename(targetPath);

  if (!(await pathExists(parentDir))) {
    return;
  }

  const entries = await fs.readdir(parentDir, { withFileTypes: true });
  const staleEntries = entries.filter(entry => entry.name.startsWith(`${baseName}.stale-`));

  for (const entry of staleEntries) {
    const fullPath = path.join(parentDir, entry.name);
    try {
      await fs.rm(fullPath, { recursive: true, force: true });
    } catch {
      // best effort only
    }
  }
}

async function removeWithRetry(targetPath, attempts = 12) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      return;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }

      if (error.code !== 'EPERM' && error.code !== 'EBUSY' && attempt === attempts) {
        throw error;
      }

      await sleep(300 * attempt);
    }
  }

  if (!(await pathExists(targetPath))) {
    return;
  }

  const staleTarget = `${targetPath}.stale-${Date.now()}`;
  await fs.rename(targetPath, staleTarget);

  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await fs.rm(staleTarget, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      return;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }

      await sleep(400 * attempt);
    }
  }
}

async function main() {
  for (const target of targets) {
    await cleanupStaleSiblings(target);
    await removeWithRetry(target);
  }
}

main().catch(error => {
  console.error('Failed to prepare Android sync:', error);
  process.exit(1);
});
