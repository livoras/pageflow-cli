#!/usr/bin/env tsx
/**
 * 通用数据提取 CLI 工具
 * 通过 HTTP API 调用 /api/extract 端点进行数据提取
 */

import { Command } from "commander";
import axios from "axios";
import * as fs from "fs";

interface ExtractionTemplate {
  id: number;
  name: string;
  description: string;
}

interface ExtractResult {
  success: boolean;
  data?: any[];
  extractedFrom?: string;
  error?: string;
}

interface ApiResponse {
  success: boolean;
  html?: string;
  extractions?: ExtractionTemplate[];
  error?: string;
}

async function listExtractions(
  apiEndpoint: string,
): Promise<ExtractionTemplate[]> {
  const response = await axios.get<ApiResponse>(
    `${apiEndpoint}/api/extractions`,
    {
      timeout: 30000,
    },
  );
  return response.data.extractions || [];
}

async function deleteExtraction(
  extractionId: number,
  apiEndpoint: string,
): Promise<ApiResponse> {
  const response = await axios.delete<ApiResponse>(
    `${apiEndpoint}/api/extractions/${extractionId}`,
    {
      timeout: 30000,
    },
  );
  return response.data;
}

async function getHtml(url: string, apiEndpoint: string): Promise<string> {
  console.error("正在获取 HTML...");
  console.error(`- URL: ${url}`);
  console.error(`- 服务器: ${apiEndpoint}`);

  const response = await axios.post<ApiResponse>(
    `${apiEndpoint}/api/html`,
    { url },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 60000,
    },
  );

  if (response.data.success && response.data.html) {
    const html = response.data.html;
    console.error(`获取成功！HTML 大小: ${html.length} 字符`);
    return html;
  } else {
    const errorMsg = response.data.error || "未知错误";
    console.error(`获取失败: ${errorMsg}`);
    process.exit(1);
  }
}

async function commonExtract(
  url: string,
  extractionId: number,
  scrolls: number,
  delay: number,
  apiEndpoint: string,
): Promise<ExtractResult> {
  const payload = {
    url,
    scrolls,
    delay,
    extraction_id: extractionId,
  };

  console.error("正在提取数据...");
  console.error(`- URL: ${url}`);
  console.error(`- 模板ID: ${extractionId}`);
  console.error(`- 滚动次数: ${scrolls}`);
  console.error(`- 延迟: ${delay}ms`);
  console.error(`- 服务器: ${apiEndpoint}`);
  console.error("");

  try {
    const response = await axios.post<ExtractResult>(
      `${apiEndpoint}/api/extract`,
      payload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120000,
      },
    );

    const result = response.data;

    if (result.success) {
      const dataCount = result.data?.length || 0;
      console.error(`提取成功！共提取 ${dataCount} 条数据`);
    } else {
      console.error(`提取失败: ${JSON.stringify(result)}`);
    }

    return result;
  } catch (error: any) {
    if (error.code === "ECONNABORTED") {
      console.error("错误: 请求超时");
    } else if (error.response) {
      console.error(
        `错误: HTTP ${error.response.status} - ${error.response.data?.error || error.message}`,
      );
      console.error("响应数据:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`错误: HTTP请求失败 - ${error.message}`);
    }
    process.exit(1);
  }
}

async function main() {
  const program = new Command();

  program
    .name("common_extract")
    .description("通用数据提取工具 - 调用 /api/extract 端点")
    .argument("[url]", "目标URL")
    .argument("[extraction_id]", "提取模板ID", (val) => parseInt(val, 10))
    .option("--list-extractions", "列出所有可用的提取模板")
    .option(
      "--delete-extraction <ids>",
      "删除指定ID的提取模板（支持逗号分隔多个ID）",
    )
    .option("--scrolls <number>", "滚动次数", "3")
    .option("--delay <ms>", "每次滚动后的延迟毫秒数", "0")
    .option("--local", "使用本地服务器 (http://localhost:3100)")
    .option("--server <url>", "自定义服务器地址")
    .option("--interval <mins>", "循环执行的时间间隔（分钟）", parseFloat)
    .option("--html <url>", "获取指定URL的HTML内容")
    .option("-o, --output <file>", "HTML输出文件路径（与--html配合使用）");

  program.parse();

  const options = program.opts();
  const args = program.args;

  // 确定API端点
  let apiEndpoint: string;
  if (options.server) {
    apiEndpoint = options.server;
  } else if (options.local) {
    apiEndpoint = "http://localhost:3100";
  } else {
    apiEndpoint = "http://100.74.12.43:8006";
  }

  // 如果是获取HTML
  if (options.html) {
    const html = await getHtml(options.html, apiEndpoint);

    if (options.output) {
      fs.writeFileSync(options.output, html, "utf-8");
      console.error(`\nHTML 已保存到: ${options.output}`);
    } else {
      console.log(html);
    }
    return;
  }

  // 如果是列出提取模板
  if (options.listExtractions) {
    const extractions = await listExtractions(apiEndpoint);

    if (extractions.length === 0) {
      console.error("没有找到任何提取模板");
      return;
    }

    console.log(`\n共有 ${extractions.length} 个提取模板：\n`);
    console.log(`${"ID".padEnd(6)} ${"名称".padEnd(30)} 描述`);
    console.log("-".repeat(80));

    for (const ext of extractions) {
      const id = String(ext.id).padEnd(6);
      const name = ext.name.substring(0, 28).padEnd(30);
      const desc = ext.description.substring(0, 40);
      console.log(`${id} ${name} ${desc}`);
    }

    console.log();
    return;
  }

  // 如果是删除提取模板
  if (options.deleteExtraction) {
    const idStr = options.deleteExtraction.trim();
    let ids: number[];

    try {
      if (idStr.includes(",")) {
        ids = idStr.split(",").map((x: string) => parseInt(x.trim(), 10));
      } else {
        ids = [parseInt(idStr, 10)];
      }
    } catch {
      console.error(`错误: 无效的 ID 格式: ${idStr}`);
      process.exit(1);
    }

    let successCount = 0;
    const failedIds: number[] = [];

    for (const extractionId of ids) {
      try {
        const result = await deleteExtraction(extractionId, apiEndpoint);
        if (result.success) {
          console.error(`成功删除提取模板 ID: ${extractionId}`);
          successCount++;
        } else {
          console.error(
            `删除 ID ${extractionId} 失败: ${result.error || "未知错误"}`,
          );
          failedIds.push(extractionId);
        }
      } catch (error: any) {
        if (error.response?.status === 404) {
          console.error(`错误: 提取模板 ID ${extractionId} 不存在`);
        } else {
          console.error(
            `错误: HTTP ${error.response?.status} - ${error.message}`,
          );
        }
        failedIds.push(extractionId);
      }
    }

    console.error(`\n删除完成: 成功 ${successCount} 个`);
    if (failedIds.length > 0) {
      console.error(`失败 ${failedIds.length} 个: ${failedIds.join(", ")}`);
      process.exit(1);
    }

    return;
  }

  // 验证必需参数
  const url = args[0];
  const extractionId =
    typeof args[1] === "number" ? args[1] : parseInt(args[1], 10);

  if (!url || extractionId === undefined || isNaN(extractionId)) {
    console.error(
      "错误: url 和 extraction_id 是必需参数（除非使用 --list-extractions 或 --html）",
    );
    process.exit(1);
  }

  const scrolls = parseInt(options.scrolls, 10);
  const delay = parseInt(options.delay, 10);

  // 如果设置了循环间隔
  if (options.interval) {
    const intervalSeconds = options.interval * 60;
    console.error(`开始循环提取（间隔: ${options.interval} 分钟）`);
    console.error("按 Ctrl+C 停止\n");

    let iteration = 0;

    const intervalFunc = async () => {
      iteration++;
      const timestamp = new Date().toLocaleString("zh-CN", { hour12: false });
      console.error("\n" + "=".repeat(60));
      console.error(`第 ${iteration} 次提取 - ${timestamp}`);
      console.error("=".repeat(60) + "\n");

      const result = await commonExtract(
        url,
        extractionId,
        scrolls,
        delay,
        apiEndpoint,
      );

      console.log(JSON.stringify(result, null, 2));
      console.log();

      if (iteration === 1) {
        const nextTime = new Date(Date.now() + intervalSeconds * 1000);
        console.error(`\n等待 ${options.interval} 分钟...`);
        console.error(
          `下次提取时间: ${nextTime.toLocaleString("zh-CN", { hour12: false })}`,
        );
      }
    };

    // 立即执行第一次
    await intervalFunc();

    // 设置定时器
    const timer = setInterval(intervalFunc, intervalSeconds * 1000);

    // 处理 Ctrl+C
    process.on("SIGINT", () => {
      clearInterval(timer);
      console.error(`\n\n用户中断，共执行了 ${iteration} 次提取`);
      process.exit(0);
    });
  } else {
    // 单次执行
    const result = await commonExtract(
      url,
      extractionId,
      scrolls,
      delay,
      apiEndpoint,
    );
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  console.error("未处理的错误:", error.message);
  process.exit(1);
});
