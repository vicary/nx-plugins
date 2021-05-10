import { Service } from 'umi/lib/ServiceWithBuiltIn';
import initWebpack from '../utils/initWebpack';
import path from 'path';
import chalk from 'chalk';

export default async function runExecutor(options: Record<string, string>) {
  process.env.NODE_ENV = 'production';

  const cwdPath = path.resolve(options.cwd);

  console.log(chalk.green(`Using cwd path: ${cwdPath}`));

  console.log(
    chalk.green(
      `Loading package.json from: ${path.resolve(cwdPath, 'package.json')}`
    )
  );

  initWebpack(cwdPath);

  const service = new Service({
    cwd: cwdPath,
    pkg: require(path.resolve(cwdPath, 'package.json')),
  });

  process.env.APP_ROOT = path.resolve(cwdPath, 'src');

  console.log(
    chalk.cyan(`process.env.UMI_VERSION: ${process.env.UMI_VERSION}`)
  );

  console.log(chalk.cyan(`process.env.UMI_DIR: ${process.env.UMI_DIR}`));

  await service.run({
    name: 'build',
    args: {},
  });

  return {
    success: true,
  };
}