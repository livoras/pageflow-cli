import { Command } from "commander";
import { spawn, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { InstanceManager } from "../../src/utils/InstanceManager";
import axios from "axios";
import * as http from "http";
import * as https from "https";

export function registerLogsCommands(program: Command): void {
  program
    .command("log <name>")
    .description("View instance logs")
    .option("-n, --lines <number>", "Number of lines to show", "100")
    .option("-f, --follow", "Follow log output (like tail -f)")
    .option("--all", "Show all log files (not just latest)")
    .addHelpText(
      "after",
      `
Examples:
  $ pageflow log default              # Show last 100 lines of latest log
  $ pageflow log default -n 50        # Show last 50 lines
  $ pageflow log default -f           # Follow log output
  $ pageflow log default --all -n 200 # Show last 200 lines from all logs
      `
    )
    .action(async (name, options) => {
      const instanceManager = new InstanceManager();
      const instance = instanceManager.getInstance(name);

      if (!instance) {
        console.error(`Error: Instance "${name}" does not exist`);
        process.exit(1);
      }

      const lines = parseInt(options.lines, 10);
      if (isNaN(lines) || lines <= 0) {
        console.error('Error: --lines must be a positive number');
        process.exit(1);
      }

      // Remote instance: fetch logs via API
      if (instance.type === 'remote') {
        const apiUrl = instanceManager.getInstanceUrl(instance);

        if (options.follow) {
          // Use SSE streaming endpoint for follow mode
          const streamUrl = new URL(`${apiUrl}/api/logs/stream`);
          streamUrl.searchParams.set('lines', String(lines));

          const protocol = streamUrl.protocol === 'https:' ? https : http;

          const req = protocol.get(streamUrl.toString(), (res) => {
            if (res.statusCode !== 200) {
              console.error(`Error: HTTP ${res.statusCode}`);
              process.exit(1);
            }

            // Process SSE stream
            let buffer = '';
            res.on('data', (chunk: Buffer) => {
              buffer += chunk.toString();
              const lines = buffer.split('\n\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.substring(6);
                  process.stdout.write(data);
                }
              }
            });

            res.on('end', () => {
              process.exit(0);
            });
          });

          req.on('error', (error: Error) => {
            console.error(`Error: ${error.message}`);
            process.exit(1);
          });

          // Handle Ctrl+C gracefully
          process.on('SIGINT', () => {
            req.destroy();
            process.exit(0);
          });

          return;
        }

        // Non-follow mode: regular API request
        try {
          const response = await axios.get(`${apiUrl}/api/logs`, {
            params: {
              lines: lines,
              all: options.all || false
            }
          });

          console.log(response.data.content);
        } catch (error: any) {
          if (error.response) {
            console.error(`Error: HTTP ${error.response.status} - ${error.response.data?.error || error.message}`);
          } else {
            console.error(`Error: ${error.message}`);
          }
          process.exit(1);
        }
        return;
      }

      // Local instance: access logs directly
      const logsDir = path.join(os.homedir(), '.pageflow', name, 'logs');

      if (!fs.existsSync(logsDir)) {
        console.error(`No logs found for instance "${name}"`);
        console.error(`Expected log directory: ${logsDir}`);
        process.exit(1);
      }

      if (options.follow) {
        // 使用 tail -f 跟踪最新日志
        const latestLog = path.join(logsDir, 'latest.log');
        if (!fs.existsSync(latestLog)) {
          console.error(`No logs found for instance "${name}"`);
          process.exit(1);
        }

        const tail = spawn('tail', ['-f', '-n', String(lines), latestLog], {
          stdio: 'inherit'
        });

        tail.on('error', (err: Error) => {
          console.error(`Error following log: ${err.message}`);
          process.exit(1);
        });

        // Handle Ctrl+C gracefully
        process.on('SIGINT', () => {
          tail.kill();
          process.exit(0);
        });
      } else if (options.all) {
        // 显示所有日志文件的最后 N 行
        const logFiles = fs.readdirSync(logsDir)
          .filter(f => f.endsWith('.log') && f !== 'latest.log')
          .sort()
          .map(f => path.join(logsDir, f));

        if (logFiles.length === 0) {
          console.error(`No logs found for instance "${name}"`);
          process.exit(1);
        }

        // 合并所有日志并取最后 N 行
        const cmd = `cat ${logFiles.map(f => `"${f}"`).join(' ')} | tail -n ${lines}`;
        const output = execSync(cmd, { encoding: 'utf-8' });
        console.log(output);
      } else {
        // 只显示最新日志的最后 N 行
        const latestLog = path.join(logsDir, 'latest.log');
        if (!fs.existsSync(latestLog)) {
          console.error(`No logs found for instance "${name}"`);
          process.exit(1);
        }

        const output = execSync(`tail -n ${lines} "${latestLog}"`, { encoding: 'utf-8' });
        console.log(output);
      }
    });
}
