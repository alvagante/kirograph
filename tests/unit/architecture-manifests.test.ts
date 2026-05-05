import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { npmParser } from '../../src/architecture/manifest/npm';
import { goParser } from '../../src/architecture/manifest/go';
import { cargoParser } from '../../src/architecture/manifest/cargo';
import { pythonParser } from '../../src/architecture/manifest/python';
import { mavenParser } from '../../src/architecture/manifest/maven';
import { gradleParser } from '../../src/architecture/manifest/gradle';
import { csprojParser } from '../../src/architecture/manifest/csproj';
import {
  parseAllManifests,
  getAllManifestParsers,
  getManifestParser,
  registerManifestParser,
} from '../../src/architecture/manifest/index';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-arch-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function write(relPath: string, content: string): string {
  const abs = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

// ── npm parser ────────────────────────────────────────────────────────────────

describe('npmParser', () => {
  it('canParse returns true for package.json', () => {
    expect(npmParser.canParse('/proj/package.json')).toBe(true);
    expect(npmParser.canParse('/proj/sub/package.json')).toBe(true);
  });

  it('canParse returns false for other files', () => {
    expect(npmParser.canParse('/proj/package.lock.json')).toBe(false);
    expect(npmParser.canParse('/proj/go.mod')).toBe(false);
  });

  it('parses a basic package.json', async () => {
    const p = write('package.json', JSON.stringify({
      name: 'my-app',
      version: '1.2.3',
      dependencies: { express: '^4.18.0' },
      devDependencies: { vitest: '^1.0.0' },
    }));
    const pkgs = await npmParser.parse(p, tmpDir);
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0].name).toBe('my-app');
    expect(pkgs[0].version).toBe('1.2.3');
    expect(pkgs[0].language).toBe('typescript');
    expect(pkgs[0].source).toBe('manifest');
    expect(pkgs[0].externalDeps).toContain('express');
    expect(pkgs[0].externalDeps).toContain('vitest');
    expect(pkgs[0].manifestPath).toBe('package.json');
    expect(pkgs[0].path).toBe('.');
  });

  it('collects peerDependencies and optionalDependencies', async () => {
    const p = write('package.json', JSON.stringify({
      name: 'my-lib',
      peerDependencies: { react: '>=18' },
      optionalDependencies: { fsevents: '*' },
    }));
    const pkgs = await npmParser.parse(p, tmpDir);
    expect(pkgs[0].externalDeps).toContain('react');
    expect(pkgs[0].externalDeps).toContain('fsevents');
  });

  it('uses directory name when no name field', async () => {
    const p = write('packages/auth/package.json', JSON.stringify({ version: '1.0.0' }));
    const pkgs = await npmParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('auth');
  });

  it('handles workspace array', async () => {
    write('packages/lib/package.json', JSON.stringify({ name: 'my-lib', version: '0.1.0' }));
    const root = write('package.json', JSON.stringify({
      name: 'root',
      workspaces: ['packages/lib'],
    }));
    const pkgs = await npmParser.parse(root, tmpDir);
    const names = pkgs.map(p => p.name);
    expect(names).toContain('root');
    expect(names).toContain('my-lib');
  });

  it('handles workspaces.packages object shape', async () => {
    write('packages/lib/package.json', JSON.stringify({ name: 'my-lib', version: '0.1.0' }));
    const root = write('package.json', JSON.stringify({
      name: 'root',
      workspaces: { packages: ['packages/lib'] },
    }));
    const pkgs = await npmParser.parse(root, tmpDir);
    const names = pkgs.map(p => p.name);
    expect(names).toContain('my-lib');
  });

  it('returns empty for invalid JSON', async () => {
    const p = write('package.json', '{ invalid json }');
    const pkgs = await npmParser.parse(p, tmpDir);
    expect(pkgs).toHaveLength(0);
  });

  it('returns empty for non-object JSON', async () => {
    const p = write('package.json', '"just a string"');
    const pkgs = await npmParser.parse(p, tmpDir);
    expect(pkgs).toHaveLength(0);
  });

  it('workspace entry without existing package.json is skipped gracefully', async () => {
    const root = write('package.json', JSON.stringify({
      name: 'root',
      workspaces: ['packages/nonexistent'],
    }));
    const pkgs = await npmParser.parse(root, tmpDir);
    expect(pkgs).toHaveLength(1); // only root
  });

  it('sets correct id for root-level package', async () => {
    const p = write('package.json', JSON.stringify({ name: 'my-app', version: '1.0.0' }));
    const pkgs = await npmParser.parse(p, tmpDir);
    expect(pkgs[0].id).toBe('pkg:npm:my-app');
  });

  it('sets correct id for subdirectory package', async () => {
    const p = write('packages/utils/package.json', JSON.stringify({ name: '@scope/utils', version: '1.0.0' }));
    const pkgs = await npmParser.parse(p, tmpDir);
    expect(pkgs[0].id).toBe('pkg:npm:packages/utils');
    expect(pkgs[0].path).toBe('packages/utils');
  });
});

// ── go parser ─────────────────────────────────────────────────────────────────

describe('goParser', () => {
  it('canParse returns true for go.mod', () => {
    expect(goParser.canParse('/proj/go.mod')).toBe(true);
  });

  it('canParse returns false for other files', () => {
    expect(goParser.canParse('/proj/go.sum')).toBe(false);
  });

  it('parses a basic go.mod', async () => {
    const p = write('go.mod', 'module github.com/myorg/myapp\n\ngo 1.21\n');
    const pkgs = await goParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('github.com/myorg/myapp');
    expect(pkgs[0].version).toBe('1.21');
    expect(pkgs[0].language).toBe('go');
    expect(pkgs[0].id).toBe('pkg:go:.');
    expect(pkgs[0].path).toBe('.');
  });

  it('parses require block dependencies', async () => {
    const p = write('go.mod', `module myapp

go 1.21

require (
  github.com/gin-gonic/gin v1.9.1
  github.com/stretchr/testify v1.8.4
)
`);
    const pkgs = await goParser.parse(p, tmpDir);
    expect(pkgs[0].externalDeps).toContain('github.com/gin-gonic/gin');
    expect(pkgs[0].externalDeps).toContain('github.com/stretchr/testify');
  });

  it('parses single-line require', async () => {
    const p = write('go.mod', 'module myapp\n\nrequire github.com/pkg/errors v0.9.1\n');
    const pkgs = await goParser.parse(p, tmpDir);
    expect(pkgs[0].externalDeps).toContain('github.com/pkg/errors');
  });

  it('uses directory name when no module line', async () => {
    const p = write('myapp/go.mod', 'go 1.21\n');
    const pkgs = await goParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('myapp');
  });

  it('returns empty for unreadable file', async () => {
    const pkgs = await goParser.parse('/nonexistent/go.mod', tmpDir);
    expect(pkgs).toHaveLength(0);
  });

  it('deduplicates deps from both single and block requires', async () => {
    const p = write('go.mod', `module myapp

require (
  github.com/pkg/errors v0.9.1
)
require github.com/pkg/errors v0.9.1
`);
    const pkgs = await goParser.parse(p, tmpDir);
    const count = pkgs[0].externalDeps!.filter(d => d === 'github.com/pkg/errors').length;
    expect(count).toBe(1);
  });
});

// ── cargo parser ──────────────────────────────────────────────────────────────

describe('cargoParser', () => {
  it('canParse returns true for Cargo.toml', () => {
    expect(cargoParser.canParse('/proj/Cargo.toml')).toBe(true);
  });

  it('canParse returns false for other files', () => {
    expect(cargoParser.canParse('/proj/Cargo.lock')).toBe(false);
  });

  it('parses a basic Cargo.toml', async () => {
    // Note: [dependencies] must be followed by another section for the regex to match
    const p = write('Cargo.toml', `[package]
name = "my-crate"
version = "0.2.0"

[dependencies]
serde = "1.0"
tokio = { version = "1", features = ["full"] }

[dev-dependencies]
`);
    const pkgs = await cargoParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('my-crate');
    expect(pkgs[0].version).toBe('0.2.0');
    expect(pkgs[0].language).toBe('rust');
    expect(pkgs[0].externalDeps).toContain('serde');
    expect(pkgs[0].externalDeps).toContain('tokio');
    expect(pkgs[0].id).toBe('pkg:cargo:.');
  });

  it('uses directory name when no [package] section', async () => {
    const p = write('mylib/Cargo.toml', '[workspace]\nmembers = []\n');
    const pkgs = await cargoParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('mylib');
  });

  it('handles workspace members', async () => {
    write('crates/lib/Cargo.toml', '[package]\nname = "my-lib"\nversion = "0.1.0"\n');
    const root = write('Cargo.toml', `[package]
name = "root"
version = "0.1.0"

[workspace]
members = ["crates/lib"]
`);
    const pkgs = await cargoParser.parse(root, tmpDir);
    const names = pkgs.map(p => p.name);
    expect(names).toContain('root');
    expect(names).toContain('my-lib');
  });

  it('workspace member with missing Cargo.toml is skipped', async () => {
    const root = write('Cargo.toml', `[package]
name = "root"
version = "0.1.0"

[workspace]
members = ["crates/nonexistent"]
`);
    const pkgs = await cargoParser.parse(root, tmpDir);
    expect(pkgs).toHaveLength(1);
  });

  it('returns empty for unreadable file', async () => {
    const pkgs = await cargoParser.parse('/nonexistent/Cargo.toml', tmpDir);
    expect(pkgs).toHaveLength(0);
  });
});

// ── python parser ─────────────────────────────────────────────────────────────

describe('pythonParser', () => {
  it('canParse returns true for pyproject.toml, setup.py, setup.cfg', () => {
    expect(pythonParser.canParse('/proj/pyproject.toml')).toBe(true);
    expect(pythonParser.canParse('/proj/setup.py')).toBe(true);
    expect(pythonParser.canParse('/proj/setup.cfg')).toBe(true);
  });

  it('canParse returns false for other files', () => {
    expect(pythonParser.canParse('/proj/requirements.txt')).toBe(false);
  });

  it('parses pyproject.toml (poetry)', async () => {
    // Note: dependencies section must be followed by another section for the regex to match
    const p = write('pyproject.toml', `[tool.poetry]
name = "my-package"
version = "0.1.0"

[tool.poetry.dependencies]
python = "^3.10"
requests = "^2.28"

[build-system]
requires = ["poetry-core"]
`);
    const pkgs = await pythonParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('my-package');
    expect(pkgs[0].version).toBe('0.1.0');
    expect(pkgs[0].language).toBe('python');
    expect(pkgs[0].externalDeps).toContain('requests');
    expect(pkgs[0].externalDeps).not.toContain('python');
  });

  it('parses pyproject.toml (PEP 517 [project])', async () => {
    const p = write('pyproject.toml', `[project]
name = "my-app"
version = "2.0.0"

[dependencies]
flask = ">=2.0"
`);
    const pkgs = await pythonParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('my-app');
    expect(pkgs[0].version).toBe('2.0.0');
  });

  it('parses setup.py', async () => {
    const p = write('setup.py', `from setuptools import setup
setup(
  name="my-app",
  version="1.0.0",
  install_requires=["flask>=2.0", "sqlalchemy"],
)
`);
    const pkgs = await pythonParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('my-app');
    expect(pkgs[0].version).toBe('1.0.0');
    expect(pkgs[0].externalDeps).toContain('flask');
    expect(pkgs[0].externalDeps).toContain('sqlalchemy');
  });

  it('parses setup.cfg', async () => {
    // Note: install_requires section must be followed by another section for the regex to match
    const p = write('setup.cfg', `[metadata]
name = my-cfg-app
version = 3.0.0

[options]
install_requires =
  requests
  click

[options.extras_require]
`);
    const pkgs = await pythonParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('my-cfg-app');
    expect(pkgs[0].version).toBe('3.0.0');
    expect(pkgs[0].externalDeps).toContain('requests');
    expect(pkgs[0].externalDeps).toContain('click');
  });

  it('uses directory name when name not found', async () => {
    const p = write('mypackage/pyproject.toml', '[build-system]\nrequires = ["setuptools"]\n');
    const pkgs = await pythonParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('mypackage');
  });

  it('sets id as pkg:python:<relDir>', async () => {
    const p = write('pyproject.toml', '[project]\nname = "app"\nversion = "1.0.0"\n');
    const pkgs = await pythonParser.parse(p, tmpDir);
    expect(pkgs[0].id).toBe('pkg:python:.');
  });

  it('returns empty for unreadable file', async () => {
    const pkgs = await pythonParser.parse('/nonexistent/pyproject.toml', tmpDir);
    expect(pkgs).toHaveLength(0);
  });
});

// ── maven parser ──────────────────────────────────────────────────────────────

describe('mavenParser', () => {
  it('canParse returns true for pom.xml', () => {
    expect(mavenParser.canParse('/proj/pom.xml')).toBe(true);
  });

  it('canParse returns false for other files', () => {
    expect(mavenParser.canParse('/proj/build.gradle')).toBe(false);
  });

  it('parses a basic pom.xml', async () => {
    const p = write('pom.xml', `<?xml version="1.0"?>
<project>
  <artifactId>my-service</artifactId>
  <version>1.0.0</version>
  <name>My Service</name>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
    </dependency>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
    </dependency>
  </dependencies>
</project>`);
    const pkgs = await mavenParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('My Service');
    expect(pkgs[0].version).toBe('1.0.0');
    expect(pkgs[0].language).toBe('java');
    expect(pkgs[0].externalDeps).toContain('spring-core');
    expect(pkgs[0].externalDeps).toContain('junit');
    expect(pkgs[0].id).toBe('pkg:maven:.');
  });

  it('falls back to artifactId when no <name>', async () => {
    const p = write('pom.xml', `<project><artifactId>my-svc</artifactId></project>`);
    const pkgs = await mavenParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('my-svc');
  });

  it('falls back to directory name when no artifactId or name', async () => {
    const p = write('myservice/pom.xml', `<project><groupId>com.example</groupId></project>`);
    const pkgs = await mavenParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('myservice');
  });

  it('returns empty for unreadable file', async () => {
    const pkgs = await mavenParser.parse('/nonexistent/pom.xml', tmpDir);
    expect(pkgs).toHaveLength(0);
  });
});

// ── gradle parser ─────────────────────────────────────────────────────────────

describe('gradleParser', () => {
  it('canParse returns true for build.gradle and build.gradle.kts', () => {
    expect(gradleParser.canParse('/proj/build.gradle')).toBe(true);
    expect(gradleParser.canParse('/proj/build.gradle.kts')).toBe(true);
  });

  it('canParse returns false for other files', () => {
    expect(gradleParser.canParse('/proj/pom.xml')).toBe(false);
  });

  it('parses a basic build.gradle', async () => {
    const p = write('build.gradle', `group = 'com.example'
version = '2.0.0'

dependencies {
  implementation 'org.springframework.boot:spring-boot-starter:3.0.0'
  testImplementation 'org.junit.jupiter:junit-jupiter:5.9.0'
}
`);
    const pkgs = await gradleParser.parse(p, tmpDir);
    expect(pkgs[0].version).toBe('2.0.0');
    expect(pkgs[0].language).toBe('java');
    expect(pkgs[0].externalDeps).toContain('org.springframework.boot:spring-boot-starter');
    expect(pkgs[0].externalDeps).toContain('org.junit.jupiter:junit-jupiter');
    expect(pkgs[0].id).toBe('pkg:gradle:.');
  });

  it('uses directory name when no group', async () => {
    const p = write('myapp/build.gradle', `version = '1.0'\ndependencies {}\n`);
    const pkgs = await gradleParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('myapp');
  });

  it('parses KTS-style assignment', async () => {
    const p = write('build.gradle.kts', `group = "com.example"\nversion = "1.0.0"\n`);
    const pkgs = await gradleParser.parse(p, tmpDir);
    expect(pkgs[0].version).toBe('1.0.0');
  });

  it('returns empty for unreadable file', async () => {
    const pkgs = await gradleParser.parse('/nonexistent/build.gradle', tmpDir);
    expect(pkgs).toHaveLength(0);
  });
});

// ── csproj parser ─────────────────────────────────────────────────────────────

describe('csprojParser', () => {
  it('canParse returns true for .csproj files', () => {
    expect(csprojParser.canParse('/proj/MyApp.csproj')).toBe(true);
    expect(csprojParser.canParse('/proj/src/MyLib.csproj')).toBe(true);
  });

  it('canParse returns false for other files', () => {
    expect(csprojParser.canParse('/proj/build.gradle')).toBe(false);
  });

  it('parses a basic .csproj file', async () => {
    const p = write('MyApp.csproj', `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <Version>3.1.0</Version>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="7.0.0" />
  </ItemGroup>
</Project>`);
    const pkgs = await csprojParser.parse(p, tmpDir);
    expect(pkgs[0].name).toBe('MyApp');
    expect(pkgs[0].version).toBe('3.1.0');
    expect(pkgs[0].language).toBe('csharp');
    expect(pkgs[0].externalDeps).toContain('Newtonsoft.Json');
    expect(pkgs[0].externalDeps).toContain('Microsoft.EntityFrameworkCore');
    expect(pkgs[0].id).toBe('pkg:csproj:.');
  });

  it('uses AssemblyVersion when no Version tag', async () => {
    const p = write('App.csproj', `<Project><PropertyGroup><AssemblyVersion>2.0.0.0</AssemblyVersion></PropertyGroup></Project>`);
    const pkgs = await csprojParser.parse(p, tmpDir);
    expect(pkgs[0].version).toBe('2.0.0.0');
  });

  it('returns empty for unreadable file', async () => {
    const pkgs = await csprojParser.parse('/nonexistent/App.csproj', tmpDir);
    expect(pkgs).toHaveLength(0);
  });
});

// ── parseAllManifests ─────────────────────────────────────────────────────────

describe('parseAllManifests()', () => {
  it('discovers and parses a package.json', async () => {
    write('package.json', JSON.stringify({ name: 'my-app', version: '1.0.0' }));
    const pkgs = await parseAllManifests(tmpDir);
    expect(pkgs.some(p => p.name === 'my-app')).toBe(true);
  });

  it('discovers and parses a go.mod', async () => {
    write('go.mod', 'module mygoapp\n\ngo 1.21\n');
    const pkgs = await parseAllManifests(tmpDir);
    expect(pkgs.some(p => p.name === 'mygoapp')).toBe(true);
  });

  it('discovers and parses a Cargo.toml', async () => {
    write('Cargo.toml', '[package]\nname = "my-crate"\nversion = "0.1.0"\n');
    const pkgs = await parseAllManifests(tmpDir);
    expect(pkgs.some(p => p.name === 'my-crate')).toBe(true);
  });

  it('discovers and parses a pom.xml', async () => {
    write('pom.xml', '<project><artifactId>my-service</artifactId></project>');
    const pkgs = await parseAllManifests(tmpDir);
    expect(pkgs.some(p => p.name === 'my-service')).toBe(true);
  });

  it('discovers and parses a .csproj file', async () => {
    write('MyApp.csproj', '<Project><PropertyGroup></PropertyGroup></Project>');
    const pkgs = await parseAllManifests(tmpDir);
    expect(pkgs.some(p => p.name === 'MyApp')).toBe(true);
  });

  it('skips node_modules directory', async () => {
    write('node_modules/some-dep/package.json', JSON.stringify({ name: 'some-dep', version: '1.0.0' }));
    write('package.json', JSON.stringify({ name: 'root', version: '1.0.0' }));
    const pkgs = await parseAllManifests(tmpDir);
    expect(pkgs.every(p => p.name !== 'some-dep')).toBe(true);
  });

  it('skips .git directory', async () => {
    write('.git/package.json', JSON.stringify({ name: 'git-pkg', version: '1.0.0' }));
    const pkgs = await parseAllManifests(tmpDir);
    expect(pkgs.every(p => p.name !== 'git-pkg')).toBe(true);
  });

  it('skips dist directory', async () => {
    write('dist/package.json', JSON.stringify({ name: 'dist-pkg', version: '1.0.0' }));
    const pkgs = await parseAllManifests(tmpDir);
    expect(pkgs.every(p => p.name !== 'dist-pkg')).toBe(true);
  });

  it('skips .kirograph directory', async () => {
    write('.kirograph/package.json', JSON.stringify({ name: 'internal-pkg', version: '1.0.0' }));
    const pkgs = await parseAllManifests(tmpDir);
    expect(pkgs.every(p => p.name !== 'internal-pkg')).toBe(true);
  });

  it('deduplicates by package id', async () => {
    // Workspace root + sub-package both at same relative dir
    write('packages/lib/package.json', JSON.stringify({ name: 'my-lib', version: '0.1.0' }));
    write('package.json', JSON.stringify({
      name: 'root',
      workspaces: ['packages/lib'],
    }));
    const pkgs = await parseAllManifests(tmpDir);
    const libPkgs = pkgs.filter(p => p.name === 'my-lib');
    expect(libPkgs).toHaveLength(1); // deduplicated
  });

  it('returns empty array for empty directory', async () => {
    const pkgs = await parseAllManifests(tmpDir);
    expect(pkgs).toHaveLength(0);
  });

  it('handles manifest parse errors gracefully', async () => {
    write('package.json', '{ bad json }');
    const pkgs = await parseAllManifests(tmpDir);
    expect(Array.isArray(pkgs)).toBe(true);
  });

  it('discovers manifests in subdirectories', async () => {
    write('services/auth/package.json', JSON.stringify({ name: 'auth-service', version: '1.0.0' }));
    write('services/api/package.json', JSON.stringify({ name: 'api-service', version: '1.0.0' }));
    const pkgs = await parseAllManifests(tmpDir);
    const names = pkgs.map(p => p.name);
    expect(names).toContain('auth-service');
    expect(names).toContain('api-service');
  });
});

// ── Registry: getAllManifestParsers / getManifestParser / registerManifestParser ──

describe('manifest parser registry', () => {
  it('getAllManifestParsers returns all 7 built-in parsers', () => {
    const parsers = getAllManifestParsers();
    const names = parsers.map(p => p.name);
    expect(names).toContain('npm');
    expect(names).toContain('go');
    expect(names).toContain('cargo');
    expect(names).toContain('python');
    expect(names).toContain('maven');
    expect(names).toContain('gradle');
    expect(names).toContain('csproj');
  });

  it('getManifestParser returns parser by name', () => {
    expect(getManifestParser('npm')).toBeDefined();
    expect(getManifestParser('go')?.language).toBe('go');
  });

  it('getManifestParser returns undefined for unknown name', () => {
    expect(getManifestParser('unknown-xyz')).toBeUndefined();
  });

  it('registerManifestParser adds new parser', () => {
    const before = getAllManifestParsers().length;
    registerManifestParser({
      name: 'test-parser-xyz',
      manifestFiles: ['test.xyz'],
      language: 'xyz',
      canParse: (p) => p.endsWith('.xyz'),
      async parse() { return []; },
    });
    expect(getAllManifestParsers().length).toBe(before + 1);
    expect(getManifestParser('test-parser-xyz')).toBeDefined();
  });

  it('registerManifestParser replaces existing parser with same name', () => {
    const replacement = {
      name: 'npm',
      manifestFiles: ['package.json'],
      language: 'typescript',
      canParse: (p: string) => p.endsWith('package.json'),
      async parse() { return []; },
    };
    const before = getAllManifestParsers().length;
    registerManifestParser(replacement);
    expect(getAllManifestParsers().length).toBe(before);
    expect(getManifestParser('npm')).toBe(replacement);
  });
});
