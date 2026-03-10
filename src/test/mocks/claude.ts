/**
 * Claude API モック
 *
 * テスト用の Anthropic SDK モックを提供する。
 * - createMockClaudeResponse: tool_use レスポンスのモック生成
 * - createMockStreamResponse: SSE ストリームのモック生成
 * - mockClaudeClient: Anthropic SDK の完全モック
 */

import { vi } from 'vitest';

// --- 型定義 ---

/** tool_use ブロックの型 */
interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** text ブロックの型 */
interface TextBlock {
  type: 'text';
  text: string;
}

type ContentBlock = TextBlock | ToolUseBlock;

/** Claude API レスポンスの型 */
interface MockClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/** SSE ストリームチャンクの型 */
interface StreamChunk {
  type: string;
  delta?: {
    type: string;
    text?: string;
  };
  content_block?: ContentBlock;
  index?: number;
}

// --- ファクトリ関数 ---

/**
 * テキストレスポンスのモックを生成
 */
export function createMockClaudeTextResponse(text: string): MockClaudeResponse {
  return {
    id: `msg_mock_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text,
      },
    ],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 100,
      output_tokens: 50,
    },
  };
}

/**
 * tool_use レスポンスのモックを生成
 */
export function createMockClaudeResponse(
  toolName: string,
  toolInput: Record<string, unknown>,
  textBeforeTool?: string,
): MockClaudeResponse {
  const content: ContentBlock[] = [];

  if (textBeforeTool) {
    content.push({ type: 'text', text: textBeforeTool });
  }

  content.push({
    type: 'tool_use',
    id: `toolu_mock_${Date.now()}`,
    name: toolName,
    input: toolInput,
  });

  return {
    id: `msg_mock_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'tool_use',
    usage: {
      input_tokens: 150,
      output_tokens: 80,
    },
  };
}

/**
 * SSE ストリームレスポンスのモックを生成
 *
 * @param chunks - ストリームで返すテキストチャンクの配列
 * @returns AsyncIterable なモックストリーム
 */
export function createMockStreamResponse(chunks: string[]): {
  [Symbol.asyncIterator]: () => AsyncIterator<StreamChunk>;
} {
  const events: StreamChunk[] = [
    { type: 'message_start' },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    },
    ...chunks.map((text) => ({
      type: 'content_block_delta' as const,
      index: 0,
      delta: { type: 'text_delta' as const, text },
    })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_stop' },
  ];

  let index = 0;

  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<StreamChunk>> {
          if (index < events.length) {
            return { value: events[index++], done: false };
          }
          return { value: undefined as unknown as StreamChunk, done: true };
        },
      };
    },
  };
}

/**
 * Anthropic SDK クライアントの完全モック
 */
export function createMockClaudeClient() {
  const mockCreate = vi.fn().mockResolvedValue(
    createMockClaudeTextResponse('これはモックレスポンスです。'),
  );

  const mockStream = vi.fn().mockReturnValue(
    createMockStreamResponse(['これは', 'モック', 'ストリーム', 'です。']),
  );

  return {
    messages: {
      create: mockCreate,
      stream: mockStream,
    },
    /** create のモック関数への直接参照（アサーション用） */
    _mockCreate: mockCreate,
    /** stream のモック関数への直接参照（アサーション用） */
    _mockStream: mockStream,
  };
}

/**
 * vi.mock 用のファクトリ
 *
 * 使用例:
 * ```ts
 * vi.mock('@anthropic-ai/sdk', () => ({
 *   default: vi.fn(() => createMockClaudeClient()),
 * }));
 * ```
 */
export const mockClaudeClient = createMockClaudeClient();
