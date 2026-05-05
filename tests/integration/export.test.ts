import { describe, it, expect } from 'vitest';
import KiroGraph from '../../src/index';
import { openFixture } from '../helpers/fixture';

// Import the build helpers directly — they don't need a running server
// We test the HTML/CSS/JS output structure without writing to disk
async function getBuildOutput() {
  const kg = await openFixture();
  const nodes = kg.getAllNodes();
  const edges = kg.getAllEdges();
  kg.close();
  // Dynamically import the internal build functions
  const { buildFiles } = await import('../../src/bin/commands/export') as any;
  return buildFiles(nodes, edges, 'sample-project', false, undefined, {});
}

describe('export buildFiles()', () => {
  it('returns html, css, and js strings', async () => {
    const { html, css, js } = await getBuildOutput();
    expect(typeof html).toBe('string');
    expect(typeof css).toBe('string');
    expect(typeof js).toBe('string');
  });

  it('html contains the project name', async () => {
    const { html } = await getBuildOutput();
    expect(html).toContain('sample-project');
  });

  it('html contains the graph container', async () => {
    const { html } = await getBuildOutput();
    expect(html).toContain('id="graph"');
  });

  it('html includes charts modal', async () => {
    const { html } = await getBuildOutput();
    expect(html).toContain('charts-modal');
  });

  it('js embeds NODES_DATA with correct count', async () => {
    const kg = await openFixture();
    const nodes = kg.getAllNodes();
    const count = nodes.length;
    kg.close();
    const { buildFiles } = await import('../../src/bin/commands/export') as any;
    const { js } = buildFiles(nodes, [], 'sample-project', false, undefined, {});
    // NODES_DATA should be a JSON array with 'count' entries
    const match = js.match(/const NODES_DATA\s*=\s*(\[.*?\]);/s);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed).toHaveLength(count);
  });

  it('css contains chart grid definition', async () => {
    const { css } = await getBuildOutput();
    expect(css).toContain('#charts-body');
    expect(css).toContain('grid-template-columns');
  });
});
