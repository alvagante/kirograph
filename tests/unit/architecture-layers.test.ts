import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectAllLayers,
  buildArchLayers,
  getAllLayerDetectors,
  registerLayerDetector,
  type FileLayerAssignment,
} from '../../src/architecture/layers/index';
import { typescriptLayerDetector } from '../../src/architecture/layers/typescript';
import { pythonLayerDetector } from '../../src/architecture/layers/python';
import { goLayerDetector } from '../../src/architecture/layers/go';
import { javaLayerDetector } from '../../src/architecture/layers/java';
import { rubyLayerDetector } from '../../src/architecture/layers/ruby';
import { rustLayerDetector } from '../../src/architecture/layers/rust';
import { csharpLayerDetector } from '../../src/architecture/layers/csharp';

// ── TypeScript Layer Detector ─────────────────────────────────────────────────

describe('typescriptLayerDetector', () => {
  it('detects api layer from routes directory', async () => {
    const matches = await typescriptLayerDetector.detect(['src/routes/users.ts'], '/proj');
    expect(matches).toHaveLength(1);
    expect(matches[0].layerName).toBe('api');
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('detects api layer from controllers directory', async () => {
    const matches = await typescriptLayerDetector.detect(['src/controllers/auth.ts'], '/proj');
    expect(matches[0].layerName).toBe('api');
  });

  it('detects api layer from .route.ts file', async () => {
    const matches = await typescriptLayerDetector.detect(['src/users.route.ts'], '/proj');
    expect(matches[0].layerName).toBe('api');
    expect(matches[0].confidence).toBe(0.9);
  });

  it('detects api layer from .controller.ts file', async () => {
    const matches = await typescriptLayerDetector.detect(['src/auth.controller.ts'], '/proj');
    expect(matches[0].layerName).toBe('api');
  });

  it('detects service layer from services directory', async () => {
    const matches = await typescriptLayerDetector.detect(['src/services/auth.ts'], '/proj');
    expect(matches[0].layerName).toBe('service');
  });

  it('detects service layer from .service.ts file', async () => {
    const matches = await typescriptLayerDetector.detect(['src/auth.service.ts'], '/proj');
    expect(matches[0].layerName).toBe('service');
  });

  it('detects data layer from repositories directory', async () => {
    const matches = await typescriptLayerDetector.detect(['src/repositories/user.ts'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('detects data layer from .repository.ts file', async () => {
    const matches = await typescriptLayerDetector.detect(['src/user.repository.ts'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('detects ui layer from components directory', async () => {
    const matches = await typescriptLayerDetector.detect(['src/components/Button.tsx'], '/proj');
    expect(matches[0].layerName).toBe('ui');
  });

  it('detects ui layer from .component.tsx file', async () => {
    const matches = await typescriptLayerDetector.detect(['src/Button.component.tsx'], '/proj');
    expect(matches[0].layerName).toBe('ui');
  });

  it('detects shared layer from utils directory', async () => {
    const matches = await typescriptLayerDetector.detect(['src/utils/format.ts'], '/proj');
    expect(matches[0].layerName).toBe('shared');
  });

  it('detects shared layer from .util.ts file', async () => {
    const matches = await typescriptLayerDetector.detect(['src/format.util.ts'], '/proj');
    expect(matches[0].layerName).toBe('shared');
  });

  it('ignores non-TS/JS files', async () => {
    const matches = await typescriptLayerDetector.detect(['src/routes/users.py', 'src/routes/config.yaml'], '/proj');
    expect(matches).toHaveLength(0);
  });

  it('supports .jsx extension', async () => {
    const matches = await typescriptLayerDetector.detect(['src/components/Button.jsx'], '/proj');
    expect(matches[0].layerName).toBe('ui');
  });

  it('supports .svelte extension', async () => {
    const matches = await typescriptLayerDetector.detect(['src/components/Header.svelte'], '/proj');
    expect(matches[0].layerName).toBe('ui');
  });

  it('config layer overrides auto-detection', async () => {
    const matches = await typescriptLayerDetector.detect(
      ['src/utils/format.ts'],
      '/proj',
      { custom: ['src/utils/**'] }
    );
    expect(matches[0].layerName).toBe('custom');
    expect(matches[0].confidence).toBe(1.0);
    expect(matches[0].matchedPattern).toBe('config:src/utils/**');
  });

  it('picks highest-confidence pattern when multiple match', async () => {
    // File matching both api (api/** = 0.75) and routes/** (0.9)
    const matches = await typescriptLayerDetector.detect(['src/api/routes/users.ts'], '/proj');
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe(0.9); // routes/** wins
  });

  it('returns empty array for files with no matching patterns', async () => {
    const matches = await typescriptLayerDetector.detect(['src/index.ts'], '/proj');
    expect(matches).toHaveLength(0);
  });

  it('detects data layer from db directory', async () => {
    const matches = await typescriptLayerDetector.detect(['src/db/connection.ts'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('detects data layer from migrations directory', async () => {
    const matches = await typescriptLayerDetector.detect(['src/migrations/001_init.ts'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('detects shared layer from middleware directory', async () => {
    const matches = await typescriptLayerDetector.detect(['src/middleware/auth.ts'], '/proj');
    expect(matches[0].layerName).toBe('shared');
  });
});

// ── Python Layer Detector ─────────────────────────────────────────────────────

describe('pythonLayerDetector', () => {
  it('detects api layer from views.py', async () => {
    const matches = await pythonLayerDetector.detect(['myapp/views.py'], '/proj');
    expect(matches[0].layerName).toBe('api');
  });

  it('detects api layer from views directory', async () => {
    const matches = await pythonLayerDetector.detect(['app/views/auth.py'], '/proj');
    expect(matches[0].layerName).toBe('api');
  });

  it('detects api layer from urls.py', async () => {
    const matches = await pythonLayerDetector.detect(['myapp/urls.py'], '/proj');
    expect(matches[0].layerName).toBe('api');
  });

  it('detects service layer from services.py', async () => {
    const matches = await pythonLayerDetector.detect(['myapp/services.py'], '/proj');
    expect(matches[0].layerName).toBe('service');
  });

  it('detects data layer from models.py', async () => {
    const matches = await pythonLayerDetector.detect(['myapp/models.py'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('detects data layer from migrations directory', async () => {
    const matches = await pythonLayerDetector.detect(['myapp/migrations/0001_initial.py'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('detects shared layer from utils.py', async () => {
    const matches = await pythonLayerDetector.detect(['myapp/utils.py'], '/proj');
    expect(matches[0].layerName).toBe('shared');
  });

  it('ignores non-.py files', async () => {
    const matches = await pythonLayerDetector.detect(['myapp/views.ts', 'myapp/models.rb'], '/proj');
    expect(matches).toHaveLength(0);
  });

  it('config layer overrides auto-detection', async () => {
    const matches = await pythonLayerDetector.detect(
      ['myapp/models.py'],
      '/proj',
      { domain: ['**/models.py'] }
    );
    expect(matches[0].layerName).toBe('domain');
    expect(matches[0].confidence).toBe(1.0);
  });
});

// ── Go Layer Detector ─────────────────────────────────────────────────────────

describe('goLayerDetector', () => {
  it('detects api layer from handler directory', async () => {
    const matches = await goLayerDetector.detect(['internal/handler/users.go'], '/proj');
    expect(matches[0].layerName).toBe('api');
  });

  it('detects api layer from _handler.go file', async () => {
    const matches = await goLayerDetector.detect(['pkg/auth_handler.go'], '/proj');
    expect(matches[0].layerName).toBe('api');
  });

  it('detects service layer from service directory', async () => {
    const matches = await goLayerDetector.detect(['internal/service/auth.go'], '/proj');
    expect(matches[0].layerName).toBe('service');
  });

  it('detects service layer from _service.go file', async () => {
    const matches = await goLayerDetector.detect(['internal/auth_service.go'], '/proj');
    expect(matches[0].layerName).toBe('service');
  });

  it('detects data layer from repository directory', async () => {
    const matches = await goLayerDetector.detect(['internal/repository/user.go'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('detects data layer from _repo.go file', async () => {
    const matches = await goLayerDetector.detect(['internal/user_repo.go'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('detects shared layer from pkg directory', async () => {
    const matches = await goLayerDetector.detect(['pkg/logger/logger.go'], '/proj');
    expect(matches[0].layerName).toBe('shared');
  });

  it('ignores non-.go files', async () => {
    const matches = await goLayerDetector.detect(['internal/handler/users.ts'], '/proj');
    expect(matches).toHaveLength(0);
  });
});

// ── Java Layer Detector ───────────────────────────────────────────────────────

describe('javaLayerDetector', () => {
  it('detects api layer from controller directory', async () => {
    const matches = await javaLayerDetector.detect(['src/main/java/com/app/controller/UserController.java'], '/proj');
    expect(matches[0].layerName).toBe('api');
    expect(matches[0].confidence).toBe(0.95);
  });

  it('detects api layer from Controller.java file', async () => {
    const matches = await javaLayerDetector.detect(['src/UserController.java'], '/proj');
    expect(matches[0].layerName).toBe('api');
  });

  it('detects service layer from service directory', async () => {
    const matches = await javaLayerDetector.detect(['src/main/java/com/app/service/AuthService.java'], '/proj');
    expect(matches[0].layerName).toBe('service');
  });

  it('detects service layer from Service.java file', async () => {
    const matches = await javaLayerDetector.detect(['src/AuthService.java'], '/proj');
    expect(matches[0].layerName).toBe('service');
  });

  it('detects data layer from repository directory', async () => {
    const matches = await javaLayerDetector.detect(['src/main/java/com/app/repository/UserRepo.java'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('detects data layer from Repository.java file', async () => {
    const matches = await javaLayerDetector.detect(['src/UserRepository.java'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('supports Kotlin (.kt) files', async () => {
    const matches = await javaLayerDetector.detect(['src/controller/UserController.kt'], '/proj');
    expect(matches[0].layerName).toBe('api');
  });

  it('ignores non-.java/.kt files', async () => {
    const matches = await javaLayerDetector.detect(['src/controller/UserController.ts'], '/proj');
    expect(matches).toHaveLength(0);
  });
});

// ── Ruby Layer Detector ───────────────────────────────────────────────────────

describe('rubyLayerDetector', () => {
  it('detects api layer from app/controllers directory', async () => {
    const matches = await rubyLayerDetector.detect(['app/controllers/users_controller.rb'], '/proj');
    expect(matches[0].layerName).toBe('api');
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('detects data layer from app/models directory', async () => {
    const matches = await rubyLayerDetector.detect(['app/models/user.rb'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('detects service layer from app/services directory', async () => {
    const matches = await rubyLayerDetector.detect(['app/services/auth_service.rb'], '/proj');
    expect(matches[0].layerName).toBe('service');
  });

  it('ignores non-.rb files', async () => {
    const matches = await rubyLayerDetector.detect(['app/controllers/users.ts'], '/proj');
    expect(matches).toHaveLength(0);
  });

  it('config layer overrides', async () => {
    const matches = await rubyLayerDetector.detect(
      ['app/models/user.rb'],
      '/proj',
      { domain: ['app/models/**'] }
    );
    expect(matches[0].layerName).toBe('domain');
    expect(matches[0].confidence).toBe(1.0);
  });
});

// ── Rust Layer Detector ───────────────────────────────────────────────────────

describe('rustLayerDetector', () => {
  it('detects api layer from handlers directory', async () => {
    const matches = await rustLayerDetector.detect(['src/handlers/users.rs'], '/proj');
    expect(matches[0].layerName).toBe('api');
  });

  it('detects data layer from schema.rs', async () => {
    const matches = await rustLayerDetector.detect(['src/schema.rs'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('detects service layer from domain directory', async () => {
    const matches = await rustLayerDetector.detect(['src/domain/auth.rs'], '/proj');
    expect(matches[0].layerName).toBe('service');
  });

  it('ignores non-.rs files', async () => {
    const matches = await rustLayerDetector.detect(['src/handlers/users.ts'], '/proj');
    expect(matches).toHaveLength(0);
  });
});

// ── C# Layer Detector ─────────────────────────────────────────────────────────

describe('csharpLayerDetector', () => {
  it('detects api layer from Controllers directory', async () => {
    const matches = await csharpLayerDetector.detect(['src/Controllers/UsersController.cs'], '/proj');
    expect(matches[0].layerName).toBe('api');
    expect(matches[0].confidence).toBe(0.95);
  });

  it('detects data layer from Repositories directory', async () => {
    const matches = await csharpLayerDetector.detect(['src/Repositories/UserRepo.cs'], '/proj');
    expect(matches[0].layerName).toBe('data');
  });

  it('detects service layer from Services directory', async () => {
    const matches = await csharpLayerDetector.detect(['src/Services/AuthService.cs'], '/proj');
    expect(matches[0].layerName).toBe('service');
  });

  it('ignores non-.cs files', async () => {
    const matches = await csharpLayerDetector.detect(['src/Controllers/Users.ts'], '/proj');
    expect(matches).toHaveLength(0);
  });
});

// ── detectAllLayers ───────────────────────────────────────────────────────────

describe('detectAllLayers()', () => {
  it('assigns TypeScript files to layers', async () => {
    const files = ['src/routes/users.ts', 'src/services/auth.ts', 'src/components/Button.tsx'];
    const assignments = await detectAllLayers(files, '/proj');
    const byPath = Object.fromEntries(assignments.map(a => [a.filePath, a]));
    expect(byPath['src/routes/users.ts'].layerName).toBe('api');
    expect(byPath['src/services/auth.ts'].layerName).toBe('service');
    expect(byPath['src/components/Button.tsx'].layerName).toBe('ui');
  });

  it('per-file: highest confidence wins across all detectors', async () => {
    // TS routes/** = 0.9; if Java also matched something with higher confidence, Java wins
    // But for a .ts file, Java ignores it — so TypeScript result stands
    const files = ['src/routes/users.ts'];
    const assignments = await detectAllLayers(files, '/proj');
    expect(assignments).toHaveLength(1);
    expect(assignments[0].layerName).toBe('api');
    expect(assignments[0].confidence).toBe(0.9);
  });

  it('config layers produce confidence=1.0 and config: prefix', async () => {
    const files = ['src/routes/users.ts'];
    const configLayers = { custom_api: ['src/routes/**'] };
    const assignments = await detectAllLayers(files, '/proj', configLayers);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].layerName).toBe('custom_api');
    expect(assignments[0].confidence).toBe(1.0);
    expect(assignments[0].matchedPattern).toBe('config:src/routes/**');
  });

  it('returns one assignment per file (no duplicates)', async () => {
    const files = ['src/routes/users.ts'];
    const assignments = await detectAllLayers(files, '/proj');
    const paths = assignments.map(a => a.filePath);
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });

  it('returns empty for unrecognized files', async () => {
    const assignments = await detectAllLayers(['src/index.ts', 'README.md'], '/proj');
    // README.md has no supported extension; src/index.ts has no matching patterns
    expect(assignments.every(a => a.filePath !== 'README.md')).toBe(true);
  });

  it('handles empty file list', async () => {
    const assignments = await detectAllLayers([], '/proj');
    expect(assignments).toHaveLength(0);
  });

  it('mixes multiple languages', async () => {
    const files = [
      'src/routes/users.ts',
      'app/views.py',
      'internal/handler/auth.go',
    ];
    const assignments = await detectAllLayers(files, '/proj');
    const byPath = Object.fromEntries(assignments.map(a => [a.filePath, a]));
    expect(byPath['src/routes/users.ts'].layerName).toBe('api');
    expect(byPath['app/views.py'].layerName).toBe('api');
    expect(byPath['internal/handler/auth.go'].layerName).toBe('api');
  });
});

// ── buildArchLayers ───────────────────────────────────────────────────────────

describe('buildArchLayers()', () => {
  const assignments: FileLayerAssignment[] = [
    { filePath: 'src/routes/a.ts', layerName: 'api', confidence: 0.9, matchedPattern: '**/routes/**' },
    { filePath: 'src/routes/b.ts', layerName: 'api', confidence: 0.9, matchedPattern: '**/routes/**' },
    { filePath: 'src/services/auth.ts', layerName: 'service', confidence: 0.9, matchedPattern: '**/services/**' },
    { filePath: 'src/utils/fmt.ts', layerName: 'shared', confidence: 0.85, matchedPattern: '**/utils/**' },
  ];

  it('produces one ArchLayer per unique layer name', () => {
    const layers = buildArchLayers(assignments);
    const names = layers.map(l => l.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('api');
    expect(names).toContain('service');
    expect(names).toContain('shared');
  });

  it('layer id is prefixed with layer:', () => {
    const layers = buildArchLayers(assignments);
    for (const l of layers) {
      expect(l.id).toBe(`layer:${l.name}`);
    }
  });

  it('patterns deduplicated within a layer', () => {
    const layers = buildArchLayers(assignments);
    const api = layers.find(l => l.name === 'api')!;
    expect(api.patterns.filter(p => p === '**/routes/**')).toHaveLength(1);
  });

  it('source=config when layer name is in configLayers', () => {
    const configLayers = { api: ['src/routes/**'], custom: ['src/custom/**'] };
    const layers = buildArchLayers(assignments, configLayers);
    const api = layers.find(l => l.name === 'api')!;
    const service = layers.find(l => l.name === 'service')!;
    expect(api.source).toBe('config');
    expect(service.source).toBe('auto');
  });

  it('source=auto when no configLayers provided', () => {
    const layers = buildArchLayers(assignments);
    for (const l of layers) {
      expect(l.source).toBe('auto');
    }
  });

  it('returns empty array for empty assignments', () => {
    expect(buildArchLayers([])).toHaveLength(0);
  });

  it('accumulates multiple distinct patterns for same layer', () => {
    const mixed: FileLayerAssignment[] = [
      { filePath: 'src/routes/a.ts', layerName: 'api', confidence: 0.9, matchedPattern: '**/routes/**' },
      { filePath: 'src/controllers/b.ts', layerName: 'api', confidence: 0.9, matchedPattern: '**/controllers/**' },
    ];
    const layers = buildArchLayers(mixed);
    const api = layers.find(l => l.name === 'api')!;
    expect(api.patterns).toContain('**/routes/**');
    expect(api.patterns).toContain('**/controllers/**');
  });
});

// ── Registry: getAllLayerDetectors / registerLayerDetector ────────────────────

describe('getAllLayerDetectors()', () => {
  it('returns at least the 7 built-in detectors', () => {
    const detectors = getAllLayerDetectors();
    const languages = detectors.map(d => d.language);
    expect(languages).toContain('typescript');
    expect(languages).toContain('python');
    expect(languages).toContain('go');
    expect(languages).toContain('java');
    expect(languages).toContain('ruby');
    expect(languages).toContain('rust');
    expect(languages).toContain('csharp');
  });
});

describe('registerLayerDetector()', () => {
  it('adds a new detector for a new language', () => {
    const before = getAllLayerDetectors().length;
    registerLayerDetector({
      language: 'elixir-test-unique',
      async detect() { return []; },
    });
    const after = getAllLayerDetectors();
    expect(after.length).toBe(before + 1);
    expect(after.some(d => d.language === 'elixir-test-unique')).toBe(true);
  });

  it('replaces existing detector for same language+framework', () => {
    const replacement = {
      language: 'typescript',
      framework: undefined as string | undefined,
      async detect() { return []; },
    };
    const before = getAllLayerDetectors().length;
    registerLayerDetector(replacement);
    expect(getAllLayerDetectors().length).toBe(before); // no new entry
    // Verify the detector was replaced
    const ts = getAllLayerDetectors().find(d => d.language === 'typescript' && d.framework === undefined)!;
    expect(ts).toBe(replacement);
  });
});
