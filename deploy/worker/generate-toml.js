/**
 * 根据环境变量生成 deploy/worker/wrangler.toml
 * 用于 GitHub Actions 部署，从 Secrets/Variables 读取配置
 *
 * 环境变量：
 *   WORKER_NAME      - Worker 名称（默认 cloudflare-imgbed）
 *   D1_DATABASE_ID   - D1 数据库 ID（本仓库不使用 D1，元数据走 KV）
 *   KV_NAMESPACE_ID  - KV 命名空间 ID（默认取仓库内固定值）
 *   R2_BUCKET_NAME   - R2 存储桶名称（默认取仓库内固定值）
 *   WORKER_VARS      - JSON 格式的业务环境变量
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, 'wrangler.toml');

const env = process.env;
const name = env.WORKER_NAME || 'cloudflare-imgbed';

// 仓库默认绑定：元数据一律走 KV，不用 D1
// CI 里可用同名 Secret 覆盖，未配置时回落到这里的值
const DEFAULT_KV_NAMESPACE_ID = '6c401946aba545b8be20ed1f17f3ba57';
const DEFAULT_R2_BUCKET_NAME = 'imgbed-r2';

const kvNamespaceId = env.KV_NAMESPACE_ID || DEFAULT_KV_NAMESPACE_ID;
const r2BucketName = env.R2_BUCKET_NAME || DEFAULT_R2_BUCKET_NAME;

let toml = `name = "${name}"
main = "index.js"
compatibility_date = "2024-08-21"
compatibility_flags = ["global_fetch_strictly_public"]

[assets]
directory = "../../frontend-dist"
binding = "ASSETS"
not_found_handling = "single-page-application"

[images]
binding = "IMAGES"
`;

// 本仓库固定使用 KV 存元数据，不再支持通过 D1_DATABASE_ID 注入 D1。
// 如需切回 D1，请同时修改 functions/utils/databaseAdapter.js 的判定优先级。

// KV 命名空间（默认启用）
toml += `
[[kv_namespaces]]
binding = "img_url"
id = "${kvNamespaceId}"
`;

// R2 存储桶（默认启用）
toml += `
[[r2_buckets]]
binding = "img_r2"
bucket_name = "${r2BucketName}"
`;

// 业务环境变量（从 JSON 解析）
if (env.WORKER_VARS) {
    try {
        const vars = JSON.parse(env.WORKER_VARS);
        const entries = Object.entries(vars);
        if (entries.length > 0) {
            toml += '\n[vars]\n';
            for (const [key, value] of entries) {
                toml += `${key} = "${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"\n`;
            }
        }
    } catch (e) {
        console.error('Warning: WORKER_VARS is not valid JSON, skipping:', e.message);
    }
}

writeFileSync(outputPath, toml, 'utf8');

// 打印配置（隐藏敏感值）
const safeToml = toml
    .replace(/database_id = ".*"/g, 'database_id = "***"')
    .replace(/(id = )".*"/g, '$1"***"')
    .replace(/(TOKEN.*= )".*"/gi, '$1"***"')
    .replace(/(KEY.*= )".*"/gi, '$1"***"')
    .replace(/(SECRET.*= )".*"/gi, '$1"***"');

console.log('Generated deploy/worker/wrangler.toml:');
console.log(safeToml);
