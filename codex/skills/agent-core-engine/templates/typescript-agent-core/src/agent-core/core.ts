export type LifecycleState =
  | "Observe"
  | "Plan"
  | "Act"
  | "AwaitTool"
  | "Integrate"
  | "CheckStop"
  | "CompactRetry"
  | "Next";

export type ErrorKind = "transient" | "deterministic" | "user_action_required";

export class ToolTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Tool timed out after ${timeoutMs}ms`);
    this.name = "ToolTimeoutError";
  }
}

export interface QueryConfig {
  readonly maxIterations: number;
  readonly maxContextTokens: number;
  readonly compactThresholdRatio: number;
  readonly toolTimeoutMs: number;
  readonly maxRetryAttempts: number;
}

export interface TickContext {
  iterationId: number;
  lifecycle: LifecycleState;
  transitionReason: string;
  timeBudget: {
    startTime: number;
    deadline: number;
  };
  tokenBudget: {
    maxContextTokens: number;
    currentUsage: number;
    compactThreshold: number;
  };
  lastProgressMarker: {
    workspaceHash: string;
    consecutiveFailures: number;
    lastErrorKind?: ErrorKind;
  };
  scratchpad: string;
  transcript: TranscriptMessage[];
  pendingToolCalls: ToolCall[];
  toolResults: ToolResult[];
}

export interface TranscriptMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  toolCallId: string;
  status: "success" | "error";
  content: string;
  exitCode?: number;
  errorKind?: ErrorKind;
  artifactPath?: string;
}

export interface ToolDefinition<TInput = unknown> {
  name: string;
  parseInput(input: unknown): TInput;
  checkPermissions(input: TInput, context: TickContext): Promise<PermissionDecision> | PermissionDecision;
  isReadOnly(input: TInput): boolean;
  isConcurrencySafe(input: TInput): boolean;
  isDestructive(input: TInput): boolean;
  interruptBehavior: "abort" | "wait" | "ignore";
  timeoutMs?: number;
  maxResultSizeChars?: number;
  execute(input: TInput, context: TickContext, signal: AbortSignal): Promise<ToolExecutionResult>;
}

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
}

export interface ToolExecutionResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  artifactPath?: string;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`duplicate tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`unknown tool: ${name}`);
    }
    return tool;
  }
}

export class ErrorClassifier {
  classify(error: unknown): ErrorKind {
    if (error instanceof ToolTimeoutError) {
      return "transient";
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/429|rate limit|timeout|timed out|AbortError|ECONNRESET|EPIPE|ETIMEDOUT|EAI_AGAIN|\b5\d\d\b/i.test(message)) {
      return "transient";
    }
    if (/permission|confirm|approval|login|credential/i.test(message)) {
      return "user_action_required";
    }
    return "deterministic";
  }
}

export class ToolRunner {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly classifier = new ErrorClassifier(),
  ) {}

  async runBatch(calls: ToolCall[], context: TickContext, config: QueryConfig): Promise<ToolResult[]> {
    const results = new Map<string, ToolResult>();
    let parallelBatch: ToolCall[] = [];

    const flushParallelBatch = async (): Promise<void> => {
      const batch = parallelBatch;
      parallelBatch = [];
      await Promise.all(batch.map(async (call) => {
        results.set(call.id, await this.runOne(call, context, config));
      }));
    };

    for (const call of calls) {
      const batchDecision = this.getBatchDecision(call);
      if (batchDecision.result) {
        await flushParallelBatch();
        results.set(call.id, batchDecision.result);
        continue;
      }
      if (batchDecision.canRunInParallel) {
        parallelBatch.push(call);
        continue;
      }

      await flushParallelBatch();
      results.set(call.id, await this.runOne(call, context, config));
    }

    await flushParallelBatch();

    return calls.map((call) => results.get(call.id) ?? {
      toolCallId: call.id,
      status: "error",
      content: "tool result missing",
      errorKind: "deterministic",
    });
  }

  private getBatchDecision(call: ToolCall): { canRunInParallel: boolean; result?: ToolResult } {
    let tool: ToolDefinition;
    let input: unknown;
    try {
      tool = this.registry.get(call.name);
      input = tool.parseInput(call.input);
    } catch (error) {
      return {
        canRunInParallel: false,
        result: deterministicToolError(call.id, error),
      };
    }

    try {
      return {
        canRunInParallel: tool.isReadOnly(input) && tool.isConcurrencySafe(input) && !tool.isDestructive(input),
      };
    } catch {
      return { canRunInParallel: false };
    }
  }

  private async runOne(call: ToolCall, context: TickContext, config: QueryConfig): Promise<ToolResult> {
    let tool: ToolDefinition;
    let input: unknown;
    try {
      tool = this.registry.get(call.name);
      input = tool.parseInput(call.input);
    } catch (error) {
      return deterministicToolError(call.id, error);
    }
    const permission = await tool.checkPermissions(input, context);
    if (!permission.allowed) {
      return {
        toolCallId: call.id,
        status: "error",
        content: permission.reason ?? "permission denied",
        errorKind: "user_action_required",
      };
    }

    const attempts = config.maxRetryAttempts + 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutMs = tool.timeoutMs ?? config.toolTimeoutMs;
      let didTimeout = false;
      const timeout = setTimeout(() => {
        didTimeout = true;
        controller.abort(new ToolTimeoutError(timeoutMs));
      }, timeoutMs);
      try {
        const result = await tool.execute(input, context, controller.signal);
        if (didTimeout) {
          throw new ToolTimeoutError(timeoutMs);
        }
        const content = normalizeToolOutput(result, tool.maxResultSizeChars);
        return {
          toolCallId: call.id,
          status: result.exitCode && result.exitCode !== 0 ? "error" : "success",
          content,
          exitCode: result.exitCode,
          artifactPath: result.artifactPath,
          errorKind: result.exitCode && result.exitCode !== 0 ? "deterministic" : undefined,
        };
      } catch (error) {
        const classifiedError = didTimeout ? new ToolTimeoutError(timeoutMs) : error;
        const errorKind = this.classifier.classify(classifiedError);
        if (errorKind !== "transient" || attempt === attempts) {
          return {
            toolCallId: call.id,
            status: "error",
            content: classifiedError instanceof Error ? classifiedError.message : String(classifiedError),
            errorKind,
          };
        }
        await delay(backoffMs(attempt));
      } finally {
        clearTimeout(timeout);
      }
    }

    return {
      toolCallId: call.id,
      status: "error",
      content: "retry exhausted",
      errorKind: "transient",
    };
  }
}

function deterministicToolError(toolCallId: string, error: unknown): ToolResult {
  return {
    toolCallId,
    status: "error",
    content: error instanceof Error ? error.message : String(error),
    errorKind: "deterministic",
  };
}

export class ContextCompactor {
  compact(context: TickContext): TickContext {
    const compacted = context.transcript.map((message) => {
      if (message.role !== "tool" || message.content.split("\n").length <= 50) {
        return message;
      }
      const lines = message.content.split("\n");
      return {
        ...message,
        content: [
          ...lines.slice(0, 20),
          "[...tool output compacted...]",
          ...lines.slice(-20),
        ].join("\n"),
      };
    });

    return {
      ...context,
      transcript: compacted,
      transitionReason: "compacted oversized tool output",
    };
  }
}

export class AgentEngine {
  constructor(
    private readonly config: QueryConfig,
    private readonly tools: ToolRunner,
    private readonly compactor = new ContextCompactor(),
  ) {}

  async tick(context: TickContext): Promise<TickContext> {
    if (context.iterationId >= this.config.maxIterations) {
      return transition(context, "CheckStop", "max iterations reached");
    }

    if (context.tokenBudget.currentUsage >= context.tokenBudget.compactThreshold) {
      return transition(this.compactor.compact(context), "CompactRetry", "context threshold reached");
    }

    if (context.pendingToolCalls.length > 0) {
      const awaited = transition(context, "AwaitTool", "pending tool calls");
      const toolResults = await this.tools.runBatch(awaited.pendingToolCalls, awaited, this.config);
      return transition({
        ...awaited,
        pendingToolCalls: [],
        toolResults,
        transcript: [
          ...awaited.transcript,
          ...toolResults.map((result): TranscriptMessage => ({
            role: "tool",
            toolCallId: result.toolCallId,
            content: result.content,
          })),
        ],
      }, "Integrate", "tool results integrated");
    }

    return transition({
      ...context,
      iterationId: context.iterationId + 1,
    }, "Next", "ready for next model turn");
  }
}

export function createInitialContext(config: QueryConfig, workspaceHash: string): TickContext {
  const now = Date.now();
  return {
    iterationId: 0,
    lifecycle: "Observe",
    transitionReason: "initial observe",
    timeBudget: {
      startTime: now,
      deadline: now + 30 * 60 * 1000,
    },
    tokenBudget: {
      maxContextTokens: config.maxContextTokens,
      currentUsage: 0,
      compactThreshold: Math.floor(config.maxContextTokens * config.compactThresholdRatio),
    },
    lastProgressMarker: {
      workspaceHash,
      consecutiveFailures: 0,
    },
    scratchpad: "",
    transcript: [],
    pendingToolCalls: [],
    toolResults: [],
  };
}

function transition(context: TickContext, lifecycle: LifecycleState, reason: string): TickContext {
  return {
    ...context,
    lifecycle,
    transitionReason: reason,
  };
}

function normalizeToolOutput(result: ToolExecutionResult, maxResultSizeChars = 12000): string {
  const chunks = [
    result.stdout ? `STDOUT:\n${result.stdout}` : "",
    result.stderr ? `STDERR:\n${result.stderr}` : "",
  ].filter(Boolean);
  const output = chunks.join("\n\n") || "completed with no output";
  if (output.length <= maxResultSizeChars) {
    return output;
  }
  return `${output.slice(0, Math.floor(maxResultSizeChars / 2))}\n[...tool output truncated...]\n${output.slice(-Math.floor(maxResultSizeChars / 2))}`;
}

function backoffMs(attempt: number): number {
  const base = 250 * 2 ** (attempt - 1);
  return base + Math.floor(Math.random() * 100);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
