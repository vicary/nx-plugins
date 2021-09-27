import {
  generateFiles,
  getWorkspaceLayout,
  names,
  offsetFromRoot,
  Tree,
  ProjectType,
  NxJsonProjectConfiguration,
  ProjectConfiguration,
} from '@nrwl/devkit';

export interface MinimalAppGeneratorSchema {
  name: string;
  tags?: string;
  directory?: string;
  projectType?: ProjectType;
}

interface MinimalNormalizedSchema extends MinimalAppGeneratorSchema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];

  projectType: ProjectType;
}

/**
 * A minimal options required for project generators
 * @param host
 * @param options
 * @returns
 */
export function minimalNormalizeOptions(
  host: Tree,
  options: MinimalAppGeneratorSchema
): MinimalNormalizedSchema {
  const name = names(options.name).fileName;

  const projectDirectory = options.directory
    ? `${names(options.directory).fileName}/${name}`
    : name;

  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectType = options.projectType ?? 'application';

  const projectRoot = `${
    getWorkspaceLayout(host)[
      projectType === 'application' ? 'appsDir' : 'libsDir'
    ]
  }/${projectDirectory}`;

  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];

  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
    projectType,
  };
}

/**
 * Add minimal files, inject minimal template placeholder(template/tmpl/offsetFromRoot)
 * @param host
 * @param templatePath
 * @param options
 */
export function minimalAddFiles(
  host: Tree,
  templatePath: string,
  options: MinimalNormalizedSchema
) {
  const templateOptions = {
    ...options,
    ...names(options.name),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    template: '',
    tmpl: '',
  };
  generateFiles(host, templatePath, options.projectRoot, templateOptions);
}

/**
 * Compose minimal project configuration in workspace.json
 * @param normalizedOptions
 * @returns
 */
export function minimalProjectConfiguration(
  normalizedOptions: MinimalNormalizedSchema
): ProjectConfiguration & NxJsonProjectConfiguration {
  return {
    root: normalizedOptions.projectRoot,
    projectType: normalizedOptions.projectType,
    sourceRoot: `${normalizedOptions.projectRoot}/src`,
    tags: normalizedOptions.parsedTags,
  };
}
