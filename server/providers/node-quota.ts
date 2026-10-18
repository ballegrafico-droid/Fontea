import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ExternalError } from "./whatfontis.js";
export async function reserveNodeQuota(
  key: string,
  limit: number,
  file: string,
) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  let lock;
  try {
    lock = await fs.open(file + ".lock", "wx", 0o600);
  } catch {
    throw new ExternalError(
      503,
      "quota_busy",
      "El control de cuota está ocupado. No se ha enviado la imagen.",
    );
  }
  try {
    let rows: Record<string, number> = {};
    try {
      rows = JSON.parse(await fs.readFile(file, "utf8"));
      if (
        !rows ||
        typeof rows !== "object" ||
        Object.values(rows).some((v) => !Number.isInteger(v) || v < 0)
      )
        throw Error();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        throw new ExternalError(
          503,
          "quota_unavailable",
          "No se puede verificar la cuota externa; no se enviará la imagen.",
        );
    }
    const day = new Date().toISOString().slice(0, 10),
      id = day + ":" + createHash("sha256").update(key).digest("hex");
    if ((rows[id] ?? 0) >= limit)
      throw new ExternalError(
        429,
        "local_quota",
        "Se ha alcanzado el límite diario de Fontea para búsquedas externas. No se compran créditos.",
      );
    rows = Object.fromEntries(
      Object.entries(rows).filter(([k]) => k.startsWith(day + ":")),
    );
    rows[id] = (rows[id] ?? 0) + 1;
    const temp = file + ".tmp";
    await fs.writeFile(temp, JSON.stringify(rows), { mode: 0o600 });
    await fs.rename(temp, file);
    return { used: rows[id], limit };
  } finally {
    await lock.close();
    await fs.unlink(file + ".lock");
  }
}
