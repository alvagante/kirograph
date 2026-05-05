/**
 * Unit tests for src/frameworks/
 * Covers: express, react, python (django/flask/fastapi) resolvers — detect() and extractNodes()
 */
import { describe, it, expect } from 'vitest';
import { expressResolver } from '../../src/frameworks/express';
import { reactResolver } from '../../src/frameworks/react';
import { djangoResolver, flaskResolver, fastapiResolver } from '../../src/frameworks/python';
import type { ResolutionContext } from '../../src/frameworks/types';

// ── Mock ResolutionContext builder ──────────────────────────────────────────────

function makeContext(opts: {
  files?: string[];
  fileContents?: Record<string, string>;
  projectRoot?: string;
} = {}): ResolutionContext {
  const files = opts.files ?? [];
  const contents = opts.fileContents ?? {};
  return {
    getNodesInFile: () => [],
    getNodesByName: () => [],
    getNodesByKind: () => [],
    fileExists: (f: string) => files.includes(f) || f in contents,
    readFile: (f: string) => contents[f] ?? null,
    getProjectRoot: () => opts.projectRoot ?? '/project',
    getAllFiles: () => files,
  };
}

// ── express resolver ───────────────────────────────────────────────────────────

describe('expressResolver.detect', () => {
  it('returns true when package.json has express dependency', () => {
    const ctx = makeContext({
      files: ['package.json'],
      fileContents: {
        'package.json': JSON.stringify({ dependencies: { express: '^4.0.0' } }),
      },
    });
    expect(expressResolver.detect(ctx)).toBe(true);
  });

  it('returns true when package.json has fastify', () => {
    const ctx = makeContext({
      fileContents: {
        'package.json': JSON.stringify({ dependencies: { fastify: '^3.0.0' } }),
      },
    });
    expect(expressResolver.detect(ctx)).toBe(true);
  });

  it('returns true when package.json has koa', () => {
    const ctx = makeContext({
      fileContents: {
        'package.json': JSON.stringify({ dependencies: { koa: '^2.0.0' } }),
      },
    });
    expect(expressResolver.detect(ctx)).toBe(true);
  });

  it('returns false when no express-like deps and no relevant files', () => {
    const ctx = makeContext({
      fileContents: {
        'package.json': JSON.stringify({ dependencies: { lodash: '^4.0.0' } }),
      },
      files: ['src/index.ts'],
    });
    expect(expressResolver.detect(ctx)).toBe(false);
  });

  it('returns true when routes/ file mentions express', () => {
    const ctx = makeContext({
      files: ['src/routes/user.ts'],
      fileContents: {
        'src/routes/user.ts': "const router = require('express').Router();\nrouter.get('/users', handler);",
      },
    });
    expect(expressResolver.detect(ctx)).toBe(true);
  });

  it('returns false when package.json is invalid JSON', () => {
    const ctx = makeContext({
      fileContents: { 'package.json': 'not valid json {' },
      files: ['src/index.ts'],
    });
    expect(expressResolver.detect(ctx)).toBe(false);
  });
});

describe('expressResolver.extractNodes', () => {
  it('extracts GET route nodes', () => {
    const content = "app.get('/users', handler);\n";
    const nodes = expressResolver.extractNodes!('routes.js', content);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes[0].kind).toBe('route');
    expect(nodes[0].name).toContain('GET');
    expect(nodes[0].name).toContain('/users');
  });

  it('extracts POST route nodes', () => {
    const content = "router.post('/login', handler);\n";
    const nodes = expressResolver.extractNodes!('auth.js', content);
    expect(nodes.some(n => n.name.includes('POST') && n.name.includes('/login'))).toBe(true);
  });

  it('extracts multiple routes from a file', () => {
    const content = [
      "app.get('/a', h);",
      "app.post('/b', h);",
      "app.delete('/c', h);",
    ].join('\n');
    const nodes = expressResolver.extractNodes!('routes.js', content);
    expect(nodes.length).toBe(3);
  });

  it('skips app.use() without a path starting with /', () => {
    const content = "app.use(bodyParser.json());\n";
    const nodes = expressResolver.extractNodes!('app.js', content);
    expect(nodes.length).toBe(0);
  });

  it('includes app.use() with a path starting with /', () => {
    const content = "app.use('/api', router);\n";
    const nodes = expressResolver.extractNodes!('app.js', content);
    expect(nodes.length).toBe(1);
  });

  it('returns empty array when no routes found', () => {
    const content = "const x = 1;\n";
    const nodes = expressResolver.extractNodes!('index.js', content);
    expect(nodes).toEqual([]);
  });
});

// ── react resolver ─────────────────────────────────────────────────────────────

describe('reactResolver.detect', () => {
  it('returns true when package.json has react', () => {
    const ctx = makeContext({
      fileContents: {
        'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }),
      },
    });
    expect(reactResolver.detect(ctx)).toBe(true);
  });

  it('returns true when package.json has next', () => {
    const ctx = makeContext({
      fileContents: {
        'package.json': JSON.stringify({ dependencies: { next: '^13.0.0' } }),
      },
    });
    expect(reactResolver.detect(ctx)).toBe(true);
  });

  it('returns false when no react-related deps', () => {
    const ctx = makeContext({
      fileContents: {
        'package.json': JSON.stringify({ dependencies: { express: '^4.0.0' } }),
      },
      files: ['src/index.ts'],
    });
    expect(reactResolver.detect(ctx)).toBe(false);
  });

  it('returns true when .tsx files exist', () => {
    const ctx = makeContext({
      files: ['src/App.tsx', 'src/index.ts'],
      fileContents: {},
    });
    expect(reactResolver.detect(ctx)).toBe(true);
  });

  it('returns true when .jsx files exist', () => {
    const ctx = makeContext({
      files: ['src/Component.jsx'],
      fileContents: {},
    });
    expect(reactResolver.detect(ctx)).toBe(true);
  });
});

describe('reactResolver.extractNodes', () => {
  it('extracts a function component', () => {
    const content = `
function MyComponent(props) {
  return <div>{props.name}</div>;
}
`;
    const nodes = reactResolver.extractNodes!('comp.tsx', content);
    expect(nodes.some(n => n.name === 'MyComponent')).toBe(true);
  });

  it('extracts an arrow function component', () => {
    const content = `
const Button = (props) => {
  return <button>{props.label}</button>;
};
`;
    const nodes = reactResolver.extractNodes!('Button.tsx', content);
    expect(nodes.some(n => n.name === 'Button')).toBe(true);
  });

  it('extracts a hook (useXxx pattern)', () => {
    const content = `
function useAuth() {
  return { user: null };
}
`;
    const nodes = reactResolver.extractNodes!('hooks.ts', content);
    expect(nodes.some(n => n.name === 'useAuth')).toBe(true);
  });

  it('does not extract functions without JSX as components', () => {
    const content = `
function notAComponent(x) {
  return x + 1;
}
`;
    const nodes = reactResolver.extractNodes!('util.ts', content);
    const componentNodes = nodes.filter(n => n.kind === 'component');
    expect(componentNodes.length).toBe(0);
  });

  it('returns empty array for empty content', () => {
    const nodes = reactResolver.extractNodes!('empty.tsx', '');
    expect(nodes).toEqual([]);
  });
});

// ── django resolver ────────────────────────────────────────────────────────────

describe('djangoResolver.detect', () => {
  it('returns true when requirements.txt contains django', () => {
    const ctx = makeContext({
      fileContents: { 'requirements.txt': 'django==4.2\npsycopg2==2.9\n' },
      files: ['requirements.txt'],
    });
    expect(djangoResolver.detect(ctx)).toBe(true);
  });

  it('returns true when manage.py exists', () => {
    const ctx = makeContext({ files: ['manage.py'], fileContents: {} });
    expect(djangoResolver.detect(ctx)).toBe(true);
  });

  it('returns false when no django indicators', () => {
    const ctx = makeContext({
      fileContents: { 'requirements.txt': 'flask==2.0\n' },
      files: ['requirements.txt', 'app.py'],
    });
    expect(djangoResolver.detect(ctx)).toBe(false);
  });
});

// ── flask resolver ─────────────────────────────────────────────────────────────

describe('flaskResolver.detect', () => {
  it('returns true when requirements.txt contains flask', () => {
    const ctx = makeContext({
      fileContents: { 'requirements.txt': 'Flask==2.3\n' },
      files: ['requirements.txt'],
    });
    expect(flaskResolver.detect(ctx)).toBe(true);
  });

  it('returns true when app.py contains Flask(__name__)', () => {
    const ctx = makeContext({
      files: ['app.py'],
      fileContents: { 'app.py': "from flask import Flask\napp = Flask(__name__)\n" },
    });
    expect(flaskResolver.detect(ctx)).toBe(true);
  });

  it('returns false when no flask indicators', () => {
    const ctx = makeContext({
      fileContents: { 'requirements.txt': 'django==4.0\n' },
      files: ['requirements.txt'],
    });
    expect(flaskResolver.detect(ctx)).toBe(false);
  });
});

// ── fastapi resolver ───────────────────────────────────────────────────────────

describe('fastapiResolver.detect', () => {
  it('returns true when requirements.txt contains fastapi', () => {
    const ctx = makeContext({
      fileContents: { 'requirements.txt': 'fastapi==0.95\nuvicorn==0.22\n' },
      files: ['requirements.txt'],
    });
    expect(fastapiResolver.detect(ctx)).toBe(true);
  });

  it('returns true when main.py contains FastAPI()', () => {
    const ctx = makeContext({
      files: ['main.py'],
      fileContents: { 'main.py': "from fastapi import FastAPI\napp = FastAPI()\n" },
    });
    expect(fastapiResolver.detect(ctx)).toBe(true);
  });

  it('returns false when no fastapi indicators', () => {
    const ctx = makeContext({
      fileContents: { 'requirements.txt': 'flask==2.0\n' },
      files: ['requirements.txt', 'app.py'],
    });
    expect(fastapiResolver.detect(ctx)).toBe(false);
  });
});

// ── framework registry ─────────────────────────────────────────────────────────

describe('framework registry', () => {
  it('getAllFrameworkResolvers returns an array of resolvers', async () => {
    const { getAllFrameworkResolvers } = await import('../../src/frameworks/index');
    const resolvers = getAllFrameworkResolvers();
    expect(Array.isArray(resolvers)).toBe(true);
    expect(resolvers.length).toBeGreaterThan(0);
  });

  it('each resolver has a name, detect, and resolve method', async () => {
    const { getAllFrameworkResolvers } = await import('../../src/frameworks/index');
    for (const r of getAllFrameworkResolvers()) {
      expect(typeof r.name).toBe('string');
      expect(typeof r.detect).toBe('function');
      expect(typeof r.resolve).toBe('function');
    }
  });

  it('getFrameworkResolver returns the named resolver', async () => {
    const { getFrameworkResolver } = await import('../../src/frameworks/index');
    const r = getFrameworkResolver('express');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('express');
  });

  it('getFrameworkResolver returns null for unknown name', async () => {
    const { getFrameworkResolver } = await import('../../src/frameworks/index');
    expect(getFrameworkResolver('nonexistent-framework') ?? null).toBeNull();
  });
});
