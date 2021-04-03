import {
  Tree,
  formatFiles,
  installPackagesTask,
  readProjectConfiguration,
  addProjectConfiguration,
  readWorkspaceConfiguration,
  updateWorkspaceConfiguration,
  getProjects,
  generateFiles,
  addDependenciesToPackageJson,
  getWorkspaceLayout,
  offsetFromRoot,
  normalizePath,
  applyChangesToString,
  joinPathFragments,
  names,
} from '@nrwl/devkit';

import { libraryGenerator } from '@nrwl/workspace/generators';
import {
  Project,
  StructureKind,
  ExportDeclarationStructure,
  OptionalKind,
} from 'ts-morph';
import path from 'path';
import {
  getAvailableLibs,
  getAvailableAppsOrLibs,
  devInfo,
  devWarn,
  isValidNamespace,
  generateDTONames,
} from '../../utils';
import {
  TypeGraphQLObjectTypeSchema,
  NormalTypeGraphQLObjectTypeSchema,
} from './schema';

export default async function (
  host: Tree,
  schema: TypeGraphQLObjectTypeSchema
) {
  // lib + 未指定directory >>> libs/lib1/src/lib
  // app + 未指定directory >>> apps/app1/types

  console.log('schema: ', schema);

  const normalizedSchema = normalizeSchema(host, schema);

  const dir = normalizedSchema.generateDirectory;
  const { className, fileName } = names(normalizedSchema.objectTypeName);

  const dtoNames = generateDTONames(className);
  if (normalizedSchema.generateAtApp) {
    generateFiles(host, path.join(__dirname, './files'), dir, {
      tmpl: '',
      ObjectType: fileName,
      componentName: className,
      interfaceName: `I${className}`,
      ...normalizedSchema,
      ...dtoNames,
    });
  } else {
    const libConfig = readProjectConfiguration(host, normalizedSchema.appOrLib);

    // libs/lib1/src
    const libSourceRoot = joinPathFragments(libConfig.sourceRoot);
    // libs/lib1/src/lib
    const libSourceLib = joinPathFragments(libConfig.sourceRoot, 'lib');
    // libs/lib1/src/index.ts
    const libSourceIndexFilePath = path.join(
      libConfig.sourceRoot,
      './index.ts'
    );

    const libSourceIndexFileContent = host
      .read(libSourceIndexFilePath)
      .toString('utf-8');

    generateFiles(host, path.join(__dirname, './files'), dir, {
      tmpl: '',
      ObjectType: fileName,
      componentName: className,
      interfaceName: `I${className}`,
      ...normalizedSchema,
      ...dtoNames,
    });

    const updatedIndexFileContent = appendExportToIndexFile(
      libSourceIndexFilePath,
      libSourceIndexFileContent,
      fileName,
      normalizedSchema?.namespaceExport ?? null,
      normalizedSchema?.directory ?? null
    );

    host.write(libSourceIndexFilePath, updatedIndexFileContent);
  }

  await formatFiles(host);

  const deps = composeDepsList(normalizedSchema);
  const devDeps = composeDevDepsList(normalizedSchema);

  addDependenciesToPackageJson(host, deps, devDeps);

  return () => {
    installPackagesTask(host);
  };
}

function normalizeSchema(
  host: Tree,
  schema: TypeGraphQLObjectTypeSchema
): NormalTypeGraphQLObjectTypeSchema {
  const { apps, libs } = getAvailableAppsOrLibs(host);

  const appNames = apps.map((app) => app.appName);
  const libNames = libs.map((lib) => lib.libName);

  if (!schema.objectTypeName) {
    throw new Error('ObjectType name required!');
  }

  if (
    !appNames.includes(schema.appOrLib) &&
    !libNames.includes(schema.appOrLib)
  ) {
    throw new Error(`app or lib ${schema.appOrLib} does not exist!`);
  }

  const appOrLibConfig = readProjectConfiguration(host, schema.appOrLib);

  const generateDirectory = joinPathFragments(
    appOrLibConfig.sourceRoot,
    appOrLibConfig.projectType === 'library'
      ? schema.directory
        ? schema.directory
        : 'lib'
      : schema.directory
      ? schema.directory
      : 'graphql'
  );

  // TODO:
  // 指定的app/lib 不存在时 抛出错误
  // 未指定app/lib 且不存在名为graphql的lib 创建名为graphql的lib来存放
  // 未指定app/lib 且名为graphql的lib已存在 抛出错误？

  // if (!schema.appOrLib && !libNames.includes('graphql')) {
  //   devInfo("lib name not specified, creating new lib 'graphql'");
  //   schema.appOrLib = 'graphql';
  // } else if (!schema.appOrLib && libNames.includes('graphql')) {
  //   devInfo("lib name not specified and lib 'graphql' exist, use it as target");
  //   schema.appOrLib = 'graphql';
  // }

  //  if (!libNames.includes(normalizedSchema.appOrLib)) {
  //     devInfo(`Creating new lib: ${normalizedSchema.appOrLib}`);
  //     await libraryGenerator(host, { name: normalizedSchema.appOrLib });
  //   }

  if (schema.extendTypeormBaseEntity && !schema.useTypeormEntityDecorator) {
    devWarn(
      "'extendTypeormBaseEntity' option require 'useTypeormEntityDecorator' to be true, set it automatically"
    );
    schema.useTypeormEntityDecorator = true;
  }

  if (!isValidNamespace(schema.namespaceExport)) {
    devWarn(`invalid namespaceExport, got ${schema.namespaceExport}, ignore`);
    schema.namespaceExport = undefined;
  }

  return {
    ...schema,
    generateDirectory,
    generateAtApp: appOrLibConfig.projectType === 'application',
  };
}

function composeDepsList(
  schema: TypeGraphQLObjectTypeSchema
): Record<string, string> {
  let basic: Record<string, string> = {
    'type-graphql': 'latest',
    graphql: 'latest',
    'reflect-metadata': 'latest',
    [schema.dtoHandler === 'ClassValidator'
      ? 'class-validator'
      : 'joi']: 'latest',
  };

  if (schema.useTypeormEntityDecorator || schema.extendTypeormBaseEntity) {
    basic = {
      ...basic,
      typeorm: 'latest',
    };
  }

  return basic;
}

function composeDevDepsList(
  schema: TypeGraphQLObjectTypeSchema
): Record<string, string> {
  const basic = {};

  return basic;
}

function appendExportToIndexFile(
  path: string,
  content: string,
  fileName: string,
  namespace?: string,
  exportFrom?: string
): string {
  const project = new Project();
  let formattedNamespace = '';

  const sourceFile = project.createSourceFile(path, content, {
    overwrite: true,
  });

  const { className } = names(namespace);

  if (
    className.toLocaleUpperCase().indexOf('OBJECT') === -1 &&
    className.toLocaleUpperCase().indexOf('OBJECTTYPE') === -1 &&
    className.toLocaleUpperCase().indexOf('TYPE') === -1
  ) {
    formattedNamespace = `${className}Type`;
  }

  const exportDeclaration: OptionalKind<ExportDeclarationStructure> = {
    kind: StructureKind.ExportDeclaration,
    isTypeOnly: false,
    moduleSpecifier: exportFrom
      ? `./${exportFrom}/${fileName}`
      : `./lib/${fileName}`,
  };

  if (namespace) {
    exportDeclaration.namespaceExport = formattedNamespace;
  }

  sourceFile.addExportDeclaration(exportDeclaration);

  return sourceFile.getFullText();
}
