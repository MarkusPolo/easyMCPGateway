import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolves a requested path against the workspace root.
 * Ensures that the resulting path does not escape the workspace directory.
 */
export function scopePath(requestedPath: string, workspaceRoot: string = process.cwd()): string {
    const resolvedPath = path.resolve(workspaceRoot, requestedPath);
    const resolvedRoot = path.resolve(workspaceRoot);
    const normalizedRoot = ensureTrailingSeparator(path.normalize(resolvedRoot));
    const normalizedResolved = path.normalize(resolvedPath);

    // Prevent escaping the root on both case-sensitive and case-insensitive platforms.
    const sameAsRoot = equalsPath(normalizedResolved, resolvedRoot);
    const insideRoot = normalizedResolved.toLowerCase().startsWith(normalizedRoot.toLowerCase());
    if (!sameAsRoot && !insideRoot) {
        throw new Error(`Access denied: Path ${requestedPath} is outside the workspace root.`);
    }

    return resolvedPath;
}

export function getProfileWorkspaceRoot(profileId: string = 'default'): string {
    const baseRoot = process.env.AGENT_WORKSPACES_ROOT?.trim()
        ? path.resolve(process.env.AGENT_WORKSPACES_ROOT.trim())
        : path.resolve(process.cwd(), 'workspaces');
    const safeProfileId = sanitizeProfileId(profileId);
    const workspaceRoot = path.resolve(baseRoot, safeProfileId);
    fs.mkdirSync(workspaceRoot, { recursive: true });
    return workspaceRoot;
}

export function scopeProfilePath(requestedPath: string, profileId: string = 'default'): string {
    return scopePath(requestedPath, getProfileWorkspaceRoot(profileId));
}

function sanitizeProfileId(profileId: string): string {
    const trimmed = (profileId || 'default').trim();
    const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, '_');
    return sanitized || 'default';
}

function ensureTrailingSeparator(input: string): string {
    return input.endsWith(path.sep) ? input : `${input}${path.sep}`;
}

function equalsPath(a: string, b: string): boolean {
    return path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
}
