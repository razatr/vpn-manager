import fs from "node:fs/promises";
import path from "node:path";

const defaultLists = [
  {
    id: "cidr-checked",
    name: "WHITE-CIDR-RU-checked",
    fileName: "WHITE-CIDR-RU-checked.txt",
    urls: [
      "https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/main/WHITE-CIDR-RU-checked.txt",
      "https://raw.githack.com/igareck/vpn-configs-for-russia/main/WHITE-CIDR-RU-checked.txt"
    ]
  },
  {
    id: "cidr-all",
    name: "WHITE-CIDR-RU-all",
    fileName: "WHITE-CIDR-RU-all.txt",
    urls: [
      "https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/main/WHITE-CIDR-RU-all.txt",
      "https://raw.githack.com/igareck/vpn-configs-for-russia/main/WHITE-CIDR-RU-all.txt"
    ]
  },
  {
    id: "sni-all",
    name: "WHITE-SNI-RU-all",
    fileName: "WHITE-SNI-RU-all.txt",
    urls: [
      "https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/main/WHITE-SNI-RU-all.txt",
      "https://raw.githack.com/igareck/vpn-configs-for-russia/main/WHITE-SNI-RU-all.txt"
    ]
  },
  {
    id: "vless-reality-mobile",
    name: "VLESS Reality White Lists Mobile",
    fileName: "Vless-Reality-White-Lists-Rus-Mobile.txt",
    urls: [
      "https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/main/Vless-Reality-White-Lists-Rus-Mobile.txt",
      "https://raw.githack.com/igareck/vpn-configs-for-russia/main/Vless-Reality-White-Lists-Rus-Mobile.txt"
    ]
  }
];

export class WhitelistProvider {
  constructor(config) {
    this.config = {
      lists: defaultLists,
      ...config
    };
    this.dataDir = this.config.dataDir;
    this.metaPath = path.join(this.dataDir, "metadata.json");
  }

  async status() {
    await fs.mkdir(this.dataDir, { recursive: true });
    const metadata = await this.readMetadata();
    const lists = await Promise.all(this.config.lists.map(async (list) => {
      const filePath = this.filePath(list);
      const stat = await statOrNull(filePath);
      return {
        id: list.id,
        name: list.name,
        fileName: list.fileName,
        sourceUrl: metadata[list.id]?.sourceUrl || list.urls[0],
        updatedAt: metadata[list.id]?.updatedAt || null,
        size: stat?.size || 0,
        exists: Boolean(stat)
      };
    }));

    return { lists };
  }

  async updateAll() {
    await fs.mkdir(this.dataDir, { recursive: true });
    const metadata = await this.readMetadata();
    const results = [];

    for (const list of this.config.lists) {
      const result = await this.updateList(list);
      metadata[list.id] = {
        sourceUrl: result.sourceUrl,
        updatedAt: result.updatedAt
      };
      results.push(result);
    }

    await fs.writeFile(this.metaPath, `${JSON.stringify(metadata, null, 2)}\n`);
    return { lists: results };
  }

  async fileFor(id) {
    const list = this.config.lists.find((item) => item.id === id);
    if (!list) {
      const error = new Error(`Whitelist not found: ${id}`);
      error.statusCode = 404;
      throw error;
    }

    const filePath = this.filePath(list);
    const stat = await statOrNull(filePath);
    if (!stat) {
      const error = new Error(`Whitelist is not downloaded: ${id}`);
      error.statusCode = 404;
      throw error;
    }

    return { filePath, fileName: list.fileName };
  }

  async updateList(list) {
    const errors = [];
    for (const url of list.urls) {
      try {
        const response = await fetch(url, {
          headers: { "user-agent": "vpn-manager/0.1" }
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const text = await response.text();
        if (text.trim().length === 0) {
          throw new Error("empty response");
        }
        const filePath = this.filePath(list);
        await fs.writeFile(filePath, normalizeText(text));
        const stat = await fs.stat(filePath);
        return {
          id: list.id,
          name: list.name,
          fileName: list.fileName,
          sourceUrl: url,
          updatedAt: new Date().toISOString(),
          size: stat.size,
          exists: true
        };
      } catch (error) {
        errors.push(`${url}: ${error.message}`);
      }
    }

    const error = new Error(`Failed to update ${list.id}: ${errors.join("; ")}`);
    error.statusCode = 502;
    throw error;
  }

  filePath(list) {
    return path.join(this.dataDir, list.fileName);
  }

  async readMetadata() {
    try {
      return JSON.parse(await fs.readFile(this.metaPath, "utf8"));
    } catch {
      return {};
    }
  }
}

function normalizeText(text) {
  return `${text.replace(/\r\n/g, "\n").trim()}\n`;
}

async function statOrNull(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}
