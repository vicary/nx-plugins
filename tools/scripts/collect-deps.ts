import path from 'path';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import { Project } from 'ts-morph';
import prettier from 'prettier';
import sortPackageJson from 'sort-package-json';
import { builtinModules } from 'module';
import jsonfile from 'jsonfile';
import pacote from 'pacote';
import glob from 'glob';
import uniq from 'lodash/uniq';

import { createMissingFields } from './fill-package-json';

// These dependencies should be add to [peerDependencies] field
// Dep packages from this repo will add to [dependencies] field by
// --buildableProjectDepsInPackageJsonType=dependencies flag
import { PRESERVED_PACKAGE_PEER_DEPS, PRESERVED_NX_PEER_DEPS } from './deps';

// TODO: support --dry-run flag
// TODO: error handler

async function collectDepsVersion(deps: string[]) {
  const depsInfoWithVersion: Record<string, string> = {};

  for (const dep of deps) {
    const manifest = await pacote.manifest(dep);
    const version = manifest.version;
    depsInfoWithVersion[dep] = `~${version}`;
  }

  return depsInfoWithVersion;
}

async function collectDepsVersionFromRootPackage(deps: string[]) {
  const depsInfoWithVersion: Record<string, string> = {};

  const rootPackge: Record<
    'dependencies' | 'devDependencies' | 'peerDependencies',
    Record<string, string>
  > = jsonfile.readFileSync(
    path.resolve(process.cwd(), 'package.json'),
    'utf8'
  );

  const rootPackgeDeps: Record<string, string> = {
    ...rootPackge.dependencies,
    ...rootPackge.devDependencies,
    ...rootPackge.peerDependencies,
  };

  for (const dep of deps) {
    const version = rootPackgeDeps[dep];
    depsInfoWithVersion[dep] = version;
  }

  return depsInfoWithVersion;
}

async function main() {
  const cwd = process.cwd();
  const allPackages = fs.readdirSync(path.resolve(cwd, 'packages'));

  const esbuildPlugins = allPackages.filter((pkg) =>
    pkg.startsWith('esbuild-plugin-')
  );

  const projectToCollectDeps: { project: string } = await inquirer.prompt([
    {
      type: 'list',
      name: 'project',
      message: 'Which project would you like to collect dependencies for?',
      choices: allPackages.filter(
        (pkg) => pkg.startsWith('nx-plugin-') || pkg.startsWith('vite-plugin-')
      ),
    },
  ]);

  const { project } = projectToCollectDeps;

  const projectPath = path.resolve(cwd, 'packages', project);
  const projectPkgFilePath = path.resolve(projectPath, 'package.json');

  const deps: string[] = [];

  const globbedFiles = glob.sync('**/*.ts', {
    cwd: projectPath,
  });

  const morphProject = new Project({
    tsConfigFilePath: path.resolve(projectPath, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });

  globbedFiles.forEach((file) => {
    const sourceFile = morphProject.createSourceFile(
      path.resolve(projectPath, file),
      fs.readFileSync(path.resolve(projectPath, file), 'utf8'),
      { overwrite: true }
    );
    sourceFile.getImportDeclarations().forEach((declaration) => {
      if (!declaration.isModuleSpecifierRelative()) {
        // this method does exist.
        // @ts-ignore
        deps.push(declaration.getModuleSpecifierValue());
      }
    });
  });

  const deduplicateDpes = uniq(deps);

  // @scope/package/src/folder -> @scope/package
  // package/src/xxx -> package
  // package -> package

  const determineDepType = (dep: string) =>
    [...PRESERVED_NX_PEER_DEPS, ...PRESERVED_PACKAGE_PEER_DEPS].includes(dep);

  // these deps will be added to the package.json in build
  const depsToExlude = [...esbuildPlugins, 'nx-plugin-devkit'];

  // TODO: optimize by lodash method
  const processedDeps = uniq(
    deduplicateDpes.map((dep) =>
      dep.includes('/')
        ? dep.startsWith('@')
          ? dep.split('/').slice(0, 2).join('/')
          : dep.split('/').shift()
        : dep
    )
  ).filter(
    (dep) => !builtinModules.includes(dep) && !depsToExlude.includes(dep)
  );

  // add to peerDependencies
  const addAsPeerDeps = processedDeps.filter((dep) => determineDepType(dep));
  // add to deps
  const addAsDeps = processedDeps.filter((dep) => !determineDepType(dep));

  const peerDepsWithVersion = await collectDepsVersionFromRootPackage(
    addAsPeerDeps
  );

  const depsWithVersion = await collectDepsVersionFromRootPackage(addAsDeps);

  const depsInfoToAdd = {
    dependencies: depsWithVersion,
    peerDependencies: peerDepsWithVersion,
  };

  const projectPkgContent = jsonfile.readFileSync(projectPkgFilePath, {
    encoding: 'utf8',
  });

  projectPkgContent.dependencies = {
    ...projectPkgContent.dependencies,
    ...depsInfoToAdd.dependencies,
  };

  projectPkgContent.peerDependencies = {
    ...projectPkgContent.peerDependencies,
    ...depsInfoToAdd.peerDependencies,
  };

  fs.writeFileSync(
    projectPkgFilePath,
    prettier.format(
      sortPackageJson(
        JSON.stringify({
          ...projectPkgContent,
          ...createMissingFields(project),
        })
      ),
      {
        parser: 'json',
      }
    )
  );
}

main();