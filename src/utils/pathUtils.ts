import * as path from 'path';

/**
 * Resolves a requested path against the workspace root.
 * Ensures that the resulting path does not escape the workspace directory.
 */
export function scopePath(requestedPath: string, workspaceRoot: string = process.cwd()): string {
    const resolvedPath = path.resolve(workspaceRoot, requestedPath);

    // Basic check to prevent escaping the root
    if (!resolvedPath.startsWith(path.resolve(workspaceRoot))) {
        throw new Error(`Access denied: Path ${requestedPath} is outside the workspace root.`);
    }

    return resolvedPath;
}
