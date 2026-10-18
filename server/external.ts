import express from "express";
import path from "node:path";
import {
  externalConfiguration,
  validateExternalBody,
  identifyExternal,
  ExternalError,
} from "./providers/whatfontis.js";
import { checkExternalPng } from "./providers/png-check.js";
import { reserveNodeQuota } from "./providers/node-quota.js";
export const externalRouter = express.Router();
externalRouter.get("/status", (_req, res) =>
  res
    .set("Cache-Control", "no-store")
    .json({ provider: "WhatFontIs", ...externalConfiguration(process.env) }),
);
let busy = false;
externalRouter.post(
  "/identify",
  express.json({ limit: "3mb" }),
  async (req, res) => {
    const config = externalConfiguration(process.env);
    if (!config.ready) {
      res.status(503).json({ error: config.message, code: config.code });
      return;
    }
    if (busy) {
      res.status(503).json({
        error: "Hay otra búsqueda externa en curso. Espera a que termine.",
        code: "external_busy",
      });
      return;
    }
    if (req.get("sec-fetch-site") === "cross-site") {
      res
        .status(403)
        .json({ error: "La búsqueda debe iniciarse desde Fontea." });
      return;
    }
    busy = true;
    const stop = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) stop.abort();
    });
    try {
      const input = validateExternalBody(req.body);
      await checkExternalPng(input.image);
      if (stop.signal.aborted)
        throw new ExternalError(
          499,
          "cancelled",
          "Búsqueda cancelada antes de enviarse.",
        );
      const quota = await reserveNodeQuota(
        process.env.WFI_API_KEY!,
        config.dailyLimit!,
        process.env.WFI_QUOTA_FILE ??
          path.resolve(".fontea/external-quota.json"),
      );
      const answer = await identifyExternal(
        input.image,
        process.env.WFI_API_KEY!,
        stop.signal,
      );
      if (!res.destroyed)
        res.set("Cache-Control", "no-store").json({ ...answer, quota });
    } catch (error) {
      if (!res.destroyed)
        res.status(error instanceof ExternalError ? error.status : 503).json({
          error:
            error instanceof ExternalError
              ? error.message
              : "No se ha podido completar la búsqueda externa.",
          code:
            error instanceof ExternalError
              ? error.code
              : "external_unavailable",
        });
    } finally {
      busy = false;
    }
  },
);
