export type HostName = "codex" | "claude-code";
export type Scope = "user" | "project" | "managed" | "plugin";
export type Severity = "high" | "medium" | "low";
export type Confidence = "high" | "medium";
export type CapabilityKind = "shell" | "network" | "secret" | "filesystem";

export interface SourceLocation {
  path: string;
  line?: number;
  field?: string;
}

export interface SourceRef {
  host: HostName;
  scope: Scope;
  location: SourceLocation;
  label: string;
}

export interface CapabilityDeclaration {
  kind: CapabilityKind;
  evidence: string;
  path: string;
  line?: number;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  path: string;
  source: SourceRef;
  contentHash: string;
  capabilities: CapabilityDeclaration[];
  declaredFiles: string[];
  enabled: boolean;
  precedence: number;
}

export interface McpRecord {
  id: string;
  name: string;
  command?: string;
  args: string[];
  url?: string;
  environmentKeys: string[];
  source: SourceRef;
  enabled: boolean;
  executableExists?: boolean;
  referencedFiles: string[];
  duplicateKey: string;
}

export interface HookRecord {
  id: string;
  event: string;
  command?: string;
  path: string;
  source: SourceRef;
  capabilities: CapabilityDeclaration[];
  enabled: boolean;
}

export interface PluginRecord {
  id: string;
  name: string;
  source: SourceRef;
  enabled: boolean;
  manifestPath: string;
  referencedFiles: string[];
}

export interface InstructionRecord {
  id: string;
  path: string;
  scope: Scope;
  source: SourceRef;
  importedFiles: string[];
  deterministicRules: DeterministicRule[];
}

export interface DeterministicRule {
  id: string;
  key: string;
  value: string;
  line: number;
  raw: string;
}

export interface UnsupportedRecord {
  id: string;
  reason: string;
  path: string;
  host: HostName;
}

export interface Inventory {
  roots: Roots;
  hosts: HostStatus[];
  skills: SkillRecord[];
  mcps: McpRecord[];
  hooks: HookRecord[];
  plugins: PluginRecord[];
  instructions: InstructionRecord[];
  unsupported: UnsupportedRecord[];
  inspectedPaths: string[];
}

export interface HostStatus {
  name: HostName;
  adapterVersion: string;
  hostVersion?: string;
  supported: boolean;
  notes: string[];
}

export interface Roots {
  home: string;
  cwd: string;
  codexHome?: string;
  claudeHome?: string;
  dataDir: string;
}

export type FixKind =
  | "disable-mcp-toml"
  | "disable-mcp-json"
  | "disable-plugin-toml"
  | "disable-plugin-json"
  | "disable-skill-dir"
  | "disable-skill-codex-config";

export interface Fix {
  id: string;
  kind: FixKind;
  label: string;
  targetPath: string;
  targetId: string;
  description: string;
}

export interface Finding {
  id: string;
  checkId: string;
  title: string;
  detail: string;
  severity: Severity;
  confidence: Confidence;
  evidence: string[];
  affectedPaths: string[];
  sourceScopes: Scope[];
  availableFixes: Fix[];
  limitations: string[];
}

export interface FileSnapshot {
  path: string;
  existed: boolean;
  bytesBase64?: string;
  backupPath?: string;
  mode?: number;
  symlinkTarget?: string;
  hash?: string;
  isDirectory?: boolean;
  renamedTo?: string;
}

export interface PlannedChange {
  path: string;
  operation: "write-file" | "rename-path" | "restore-file";
  beforeHash?: string;
  afterHash?: string;
  afterBytesBase64?: string;
  renameTo?: string;
  rationale: string;
  findingId: string;
}

export interface Transaction {
  id: string;
  createdAt: string;
  toolVersion: string;
  adapterVersions: Record<string, string>;
  status: "applied" | "undone" | "failed";
  summary: string;
  changes: PlannedChange[];
  snapshots: FileSnapshot[];
  outcome?: string;
}

export interface ScanResult {
  inventory: Inventory;
  findings: Finding[];
}
