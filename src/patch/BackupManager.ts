import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SnapshotManifest {
  id: string;         // timestamp key, e.g. "2024-01-15T10-30-00-000Z"
  createdAt: string;  // ISO string
  files: Array<{
    relativePath: string;   // relative to repoRoot
    backupRelPath: string;  // relative to the snapshot folder
  }>;
}

export interface RestoreResult {
  success: boolean;
  restoredFiles: string[];
  backupId: string;
}

const BACKUPS_DIR = '.agcp/backups';

/**
 * BackupManager
 * Creates timestamped snapshots of files before a patch is applied,
 * and can restore them on demand.
 */
export class BackupManager {
  private readonly backupsRoot: string;

  constructor(private readonly repoRoot: string) {
    this.backupsRoot = path.join(repoRoot, BACKUPS_DIR);
  }

  /**
   * Copies the given files into a new timestamped snapshot folder.
   * Returns the snapshot folder path (absolute).
   */
  createSnapshot(relativeFilePaths: string[]): string {
    const id = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotDir = path.join(this.backupsRoot, id);
    fs.mkdirSync(snapshotDir, { recursive: true });

    const manifest: SnapshotManifest = {
      id,
      createdAt: new Date().toISOString(),
      files: [],
    };

    for (const rel of relativeFilePaths) {
      const src = path.resolve(this.repoRoot, rel);
      if (!fs.existsSync(src)) continue; // new file — nothing to back up

      // Preserve directory structure inside the snapshot
      const backupRelPath = rel.replace(/\//g, '__').replace(/\\/g, '__');
      const dest = path.join(snapshotDir, backupRelPath);

      fs.copyFileSync(src, dest);
      manifest.files.push({ relativePath: rel, backupRelPath });
    }

    // Persist manifest
    fs.writeFileSync(
      path.join(snapshotDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    return snapshotDir;
  }

  /**
   * Restores files from the given snapshot folder back to the repo.
   */
  restore(snapshotPath: string): RestoreResult {
    const manifestPath = path.join(snapshotPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No manifest.json found in snapshot: ${snapshotPath}`);
    }

    const manifest: SnapshotManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const restoredFiles: string[] = [];

    for (const entry of manifest.files) {
      const src = path.join(snapshotPath, entry.backupRelPath);
      const dest = path.resolve(this.repoRoot, entry.relativePath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      restoredFiles.push(entry.relativePath);
    }

    return { success: true, restoredFiles, backupId: manifest.id };
  }

  /**
   * Restores from the most recent backup, or from a specific backup ID.
   */
  restoreLatest(backupId?: string): RestoreResult {
    if (!fs.existsSync(this.backupsRoot)) {
      throw new Error('No backups directory found. No patches have been applied yet.');
    }

    let targetDir: string;

    if (backupId) {
      targetDir = path.join(this.backupsRoot, backupId);
      if (!fs.existsSync(targetDir)) {
        throw new Error(`Backup not found: ${backupId}`);
      }
    } else {
      const entries = fs.readdirSync(this.backupsRoot)
        .filter(e => fs.statSync(path.join(this.backupsRoot, e)).isDirectory())
        .sort(); // ISO timestamps sort lexicographically == chronologically

      if (entries.length === 0) {
        throw new Error('No backups available to restore.');
      }

      targetDir = path.join(this.backupsRoot, entries[entries.length - 1]);
    }

    return this.restore(targetDir);
  }

  /**
   * Lists all available backup IDs, newest first.
   */
  listBackups(): string[] {
    if (!fs.existsSync(this.backupsRoot)) return [];
    return fs.readdirSync(this.backupsRoot)
      .filter(e => fs.statSync(path.join(this.backupsRoot, e)).isDirectory())
      .sort()
      .reverse();
  }
}

