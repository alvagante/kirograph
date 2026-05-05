import { describe, it, expect } from 'vitest';
import { MCPServer } from '../../src/mcp/server';
import { FIXTURE_PATH } from '../helpers/fixture';

function makeServer() {
  return new MCPServer(FIXTURE_PATH);
}

async function send(server: MCPServer, msg: object) {
  return (server as any).handleMessage(msg);
}

describe('MCPServer.handleMessage()', () => {
  it('initialize returns protocolVersion and serverInfo', async () => {
    const server = makeServer();
    const response = await send(server, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {} },
    });
    expect(response).toBeDefined();
    expect(response.protocolVersion).toBeDefined();
    expect(response.serverInfo?.name).toBe('kirograph');
  });

  it('tools/list returns an array of tools', async () => {
    const server = makeServer();
    const response = await send(server, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    expect(Array.isArray(response.tools)).toBe(true);
    expect(response.tools.length).toBeGreaterThan(0);
  });

  it('tools/list entries have name and description', async () => {
    const server = makeServer();
    const response = await send(server, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: {},
    });
    for (const tool of response.tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
    }
  });

  it('unknown method returns undefined (error sent via transport)', async () => {
    const server = makeServer();
    const response = await send(server, {
      jsonrpc: '2.0',
      id: 4,
      method: 'unknown/method',
      params: {},
    });
    // handleMessage calls transport.sendError for unknown methods and returns undefined
    expect(response).toBeUndefined();
  });

  it('notifications/initialized returns empty object (no error)', async () => {
    const server = makeServer();
    const response = await send(server, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    });
    expect(response).toBeDefined();
  });

  it('ping returns empty object', async () => {
    const server = makeServer();
    const response = await send(server, {
      jsonrpc: '2.0',
      id: 5,
      method: 'ping',
      params: {},
    });
    expect(response).toBeDefined();
  });

  it('initialize returns capabilities with tools', async () => {
    const server = makeServer();
    const response = await send(server, {
      jsonrpc: '2.0',
      id: 6,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {} },
    });
    expect(response.capabilities?.tools).toBeDefined();
  });

  it('tools/list tools have inputSchema', async () => {
    const server = makeServer();
    const response = await send(server, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/list',
      params: {},
    });
    for (const tool of response.tools) {
      expect(tool.inputSchema).toBeDefined();
    }
  });
});
