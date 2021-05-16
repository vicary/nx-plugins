import execa, { Options, ExecaChildProcess } from 'execa';
import path from 'path';
import { Plugin } from 'esbuild';
import fs from 'fs-extra';
import chalk from 'chalk';

const debug = require('debug')('plugin:run');

export interface RunOptions {
  execaOptions?: Options;
  customRunner?: (filePath: string) => ExecaChildProcess<string>;
}

export default (options: RunOptions = {}): Plugin => {
  let execaProcess: ExecaChildProcess<string>;

  return {
    name: 'esbuild:run',
    async setup({ initialOptions }) {
      if (
        initialOptions.write &&
        typeof initialOptions.write === 'boolean' &&
        (initialOptions.write as boolean) === false
      ) {
        console.warn(
          chalk.yellow('WARN'),
          'ESBuild-Plugin-Run skipped because wtite option is set to be false'
        );
        return;
      }

      if (initialOptions.outdir && !initialOptions.outfile) {
        console.warn(
          chalk.yellow('WARN'),
          `ESBuild-Plugin-Run skipped because there are multiple outputs(outdir option is specified, ${initialOptions.outdir})`
        );
        return;
      }

      const filePath = path.join(process.cwd(), initialOptions.outfile);

      const runner = (execFilePath: string) => {
        if (execaProcess && !execaProcess.killed) {
          execaProcess?.kill();
        }

        console.log(
          chalk.blue('i'),
          `ESBuild-Plugin-Run is executing file by ${chalk.cyan(
            options.customRunner ? 'customRunner' : 'execa.node'
          )}`
        );

        execaProcess = options.customRunner
          ? options.customRunner(execFilePath)
          : execa.node(execFilePath, {
              stdio: 'inherit',
              ...(options?.execaOptions ?? {}),
            });

        return execaProcess;
      };

      if (!fs.existsSync(filePath)) {
        return;
      }

      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      process.stdin.on('data', (data) => {
        const line = data.toString().trim().toLowerCase();
        if (line === 'rs' || line === 'restart') {
          runner(filePath);
        } else if (line === 'cls' || line === 'clear') {
          console.clear();
        }
      });

      return new Promise((resolve, reject) => {
        setTimeout(() => {
          debug('resolved');
          runner(filePath).then((cp) => {
            resolve();
          });
        }, 1000);
      });
    },
  };
};