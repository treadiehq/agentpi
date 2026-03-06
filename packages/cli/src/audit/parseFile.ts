import { Project, Node } from 'ts-morph';
import { relative } from 'path';
import type { ToolFinding, FunctionKind } from './types';
import { classifyRisk } from './classifyRisk';
import { SUSPICIOUS_FILE_PATTERNS } from './rules/keywords';

// Shared project instance — reused across all files in a scan for performance.
let project: Project | null = null;

function getProject(): Project {
  if (!project) {
    project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, checkJs: false },
    });
  }
  return project;
}

export function resetProject() {
  project = null;
}

function isSuspiciousFile(filePath: string): boolean {
  const basename = filePath.split('/').pop() || '';
  return SUSPICIOUS_FILE_PATTERNS.some((p) => p.test(basename));
}

export function parseFile(filePath: string, cwd: string): ToolFinding[] {
  const proj = getProject();
  const findings: ToolFinding[] = [];
  const suspicious = isSuspiciousFile(filePath);

  let sourceFile = proj.getSourceFile(filePath);
  if (!sourceFile) {
    sourceFile = proj.addSourceFileAtPath(filePath);
  }

  const relPath = relative(cwd, filePath);

  // 1. Exported function declarations: export function foo() {}
  for (const fn of sourceFile.getFunctions()) {
    const isExported = fn.isExported();
    if (!isExported && !suspicious) continue;

    const name = fn.getName();
    if (!name) continue;

    const line = fn.getStartLineNumber();
    const bodyText = fn.getBody()?.getText() ?? '';
    const { risk, reasons, signals } = classifyRisk(name, bodyText);

    findings.push({
      filePath: relPath,
      functionName: name,
      line,
      exported: isExported,
      kind: 'function' as FunctionKind,
      risk,
      reasons,
      signals,
    });
  }

  // 2. Exported variable declarations with arrow functions:
  //    export const foo = () => {}
  //    export const foo = async () => {}
  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const initializer = varDecl.getInitializer();
    if (!initializer) continue;

    const isArrow =
      Node.isArrowFunction(initializer) ||
      // async arrow wrapped in call expression
      (Node.isCallExpression(initializer) &&
        initializer.getArguments().some((a) => Node.isArrowFunction(a)));

    if (!isArrow) continue;

    const varStatement = varDecl.getVariableStatement();
    const isExported = varStatement?.isExported() ?? false;
    if (!isExported && !suspicious) continue;

    const name = varDecl.getName();
    const line = varDecl.getStartLineNumber();
    const bodyText = Node.isArrowFunction(initializer)
      ? (initializer.getBody()?.getText() ?? '')
      : '';

    const { risk, reasons, signals } = classifyRisk(name, bodyText);

    findings.push({
      filePath: relPath,
      functionName: name,
      line,
      exported: isExported,
      kind: 'arrow_function' as FunctionKind,
      risk,
      reasons,
      signals,
    });
  }

  // 3. Class methods — only from exported classes.
  // Non-exported classes are internal implementation detail; including their
  // methods in suspicious files generates too much noise.
  for (const cls of sourceFile.getClasses()) {
    if (!cls.isExported()) continue;

    for (const method of cls.getMethods()) {
      const scope = method.getScope();
      if (scope === 'private' || scope === 'protected') continue;

      const name = method.getName();
      if (!name || name.startsWith('_')) continue;

      const line = method.getStartLineNumber();
      const bodyText = method.getBody()?.getText() ?? '';
      const { risk, reasons, signals } = classifyRisk(name, bodyText);

      findings.push({
        filePath: relPath,
        functionName: name,
        line,
        exported: true,
        kind: 'method' as FunctionKind,
        risk,
        reasons,
        signals,
      });
    }
  }

  // Deduplicate — re-exports or barrel files can surface the same symbol
  // multiple times (same file + name + line). Keep first occurrence.
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.filePath}::${f.functionName}::${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
